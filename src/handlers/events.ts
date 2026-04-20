/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { createProvider, } from '../agent/providers/index.js';
import { runAgent, } from '../agent/runner.js';
import { createLogger, } from '../logger.js';
import { postMessage, } from '../slack/api.js';
import type { Env, SlackEvent, SlackEventPayload, } from '../types.js';

/**
 * Handles incoming Slack Events API payloads.
 *
 * Flow:
 *  1. url_verification  — echo challenge (one-time app setup handshake)
 *  2. app_rate_limited  — log rate-limit notice, return 200
 *  3. event_callback    — ack immediately, process async via ctx.waitUntil
 *
 * Retry deduplication: Slack sets x-slack-retry-num on retries. We skip
 * reprocessing retried events because the original delivery is already
 * in-flight (or completed) via ctx.waitUntil. For full idempotency, pair
 * this with KV-based event_id deduplication.
 *
 * Reference: https://docs.slack.dev/apis/events-api/
 */
export async function handleEvent(
  request: Request,
  payload: SlackEventPayload,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // 1. URL verification — must respond before any retry check
  if (payload.type === 'url_verification') {
    return new Response(JSON.stringify({ challenge: payload.challenge, },), {
      headers: { 'Content-Type': 'application/json', },
    },);
  }

  // 2. Skip Slack retries — the original request is already being processed.
  //    Returning 200 immediately stops further retry attempts for this event.
  const retryNum = request.headers.get('x-slack-retry-num',);
  if (retryNum !== null) {
    console.log(
      `Dropping retry #${retryNum} for event ${payload.event_id ?? 'unknown'} `
        + `(reason: ${request.headers.get('x-slack-retry-reason',) ?? 'unknown'})`,
    );
    return new Response('OK', { status: 200, },);
  }

  // 3. Rate-limited notification — Slack sends this instead of real events
  //    when delivery exceeds 30,000 events/workspace/app per 60-minute window.
  if (payload.type === 'app_rate_limited') {
    console.warn(
      `app_rate_limited: team=${payload.team_id} `
        + `app=${payload.api_app_id} `
        + `minute=${payload.minute_rate_limited}`,
    );
    return new Response('OK', { status: 200, },);
  }

  // 4. Normal event — ack immediately, process in background
  if (payload.type === 'event_callback' && payload.event) {
    ctx.waitUntil(processEvent(payload, env,),);
  }

  return new Response('OK', { status: 200, },);
}

async function processEvent(payload: SlackEventPayload, env: Env,): Promise<void> {
  const log = createLogger(env, { eventId: payload.event_id, },);
  const event = payload.event!;

  switch (event.type) {
    case 'app_mention':
      await handleMention(event, env, log,);
      break;

    case 'message':
      // Only handle DMs; ignore bot messages to prevent infinite loops.
      if (!event.bot_id && event.channel_type === 'im') {
        await handleDirectMessage(event, env, log,);
      }
      break;

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Agent invocation helpers
// ---------------------------------------------------------------------------

/** Maximum wall-clock time allowed for the agent, in ms.
 *  Must be comfortably below Cloudflare Workers' 30-second waitUntil limit. */
const AGENT_TIMEOUT_MS = 25_000;

/**
 * Runs runAgent with a hard wall-clock timeout.
 * Returns the answer string, or throws if the timeout fires first.
 */
async function runAgentWithTimeout(
  question: string,
  gatewayUrl: string,
  provider: import('../agent/types.js').AgentProvider,
  debugCallback: ((text: string,) => Promise<void>) | undefined,
  log: ReturnType<typeof createLogger>,
): Promise<string> {
  return Promise.race([
    runAgent(question, gatewayUrl, provider, debugCallback, log,),
    new Promise<never>((_, reject,) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Agent timed out after ${
                AGENT_TIMEOUT_MS / 1000
              }s. Try a more specific question or use the slash commands (/competitions, /results, …).`,
            ),
          ),
        AGENT_TIMEOUT_MS,
      )
    ),
  ],);
}

/**
 * Strips `(DEBUG=true)` from the text and returns whether debug mode was requested.
 */
function extractDebugFlag(text: string,): { text: string; debug: boolean; } {
  const debug = /\(DEBUG=true\)/i.test(text,);
  return { text: text.replace(/\s*\(DEBUG=true\)\s*/gi, ' ',).trim(), debug, };
}

/**
 * Extracts the league and question from a raw Slack message text.
 *
 * Strips any bot mention prefix (<@UXXXXXX>), then checks whether the first
 * word looks like a league code (2–8 lowercase letters). Falls back to
 * DEFAULT_LEAGUE when no code is found.
 *
 * Returns null when no league can be determined.
 */
function parseQuery(
  rawText: string,
  defaultLeague: string | undefined,
): { league: string; question: string; } | null {
  // Strip leading bot mention: "<@U12345> ..."
  const text = rawText.replace(/^<@[A-Z0-9]+>\s*/i, '',).trim();
  if (!text) { return null; }

  const spaceIdx = text.indexOf(' ',);
  const firstWord = spaceIdx >= 0 ? text.slice(0, spaceIdx,) : text;
  const rest = spaceIdx >= 0 ? text.slice(spaceIdx + 1,).trim() : '';

  // A league code is 2–8 lowercase letters (e.g. lcapb, ccapb).
  if (/^[a-z]{2,8}$/.test(firstWord,) && rest) {
    return { league: firstWord, question: rest, };
  }

  // No league code in the message — fall back to the configured default.
  if (defaultLeague) {
    return { league: defaultLeague, question: text, };
  }

  return null;
}

/**
 * Runs the agent for a mention (@xilo ...) and replies in-thread.
 *
 * Thread strategy: use event.thread_ts if the mention is already inside a
 * thread; otherwise use event.ts to start a new thread on that message.
 */
async function handleMention(
  event: SlackEvent,
  env: Env,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  if (!event.channel || !event.text) { return; }

  const threadTs = event.thread_ts ?? event.ts;
  const { text: cleanText, debug: debugMode, } = extractDebugFlag(event.text,);
  const parsed = parseQuery(cleanText, env.DEFAULT_LEAGUE,);

  log.info({
    event: 'app_mention',
    user: event.user,
    channel: event.channel,
    debugMode,
    league: parsed?.league,
  }, 'mention received',);

  if (!parsed) {
    await postMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      'Please include a league code or configure `DEFAULT_LEAGUE`. '
        + 'Example: `@xilo ccapb what are the results of Trinquet in 1ère Série?`',
      undefined,
      threadTs,
    );
    return;
  }

  let provider;
  try {
    provider = createProvider(env, log,);
  } catch (err) {
    log.error({ err: String(err,), }, 'agent provider configuration error',);
    await postMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      `Agent not configured: ${String(err,)}`,
      undefined,
      threadTs,
    );
    return;
  }

  // Post a thinking placeholder so the user knows we're working on it.
  await postMessage(
    env.SLACK_BOT_TOKEN,
    event.channel,
    '_Thinking… querying the Frontis database._',
    undefined,
    threadTs,
  ).catch(() => {},);

  const agentQuestion = `League: ${parsed.league}\n\nQuestion: ${parsed.question}`;
  const channel = event.channel;
  const debugCallback = debugMode
    ? async (msg: string,) => {
      await postMessage(env.SLACK_BOT_TOKEN, channel, msg, undefined, threadTs,);
    }
    : undefined;

  try {
    const answer = await runAgentWithTimeout(
      agentQuestion,
      env.FRONTIS_URL,
      provider,
      debugCallback,
      log,
    );
    await postMessage(env.SLACK_BOT_TOKEN, channel, answer, undefined, threadTs,);
  } catch (err) {
    log.error({ err: String(err,), }, 'agent error in mention handler',);
    await postMessage(
      env.SLACK_BOT_TOKEN,
      channel,
      `Agent error: ${String(err,)}`,
      undefined,
      threadTs,
    );
  }
}

/**
 * Runs the agent for a direct message and replies in the same DM channel.
 */
async function handleDirectMessage(
  event: SlackEvent,
  env: Env,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  if (!event.channel || !event.text) { return; }

  const { text: cleanText, debug: debugMode, } = extractDebugFlag(event.text,);
  const parsed = parseQuery(cleanText, env.DEFAULT_LEAGUE,);

  log.info({
    event: 'dm',
    user: event.user,
    channel: event.channel,
    debugMode,
    league: parsed?.league,
  }, 'DM received',);

  if (!parsed) {
    await postMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      'Please include a league code or ask your admin to configure `DEFAULT_LEAGUE`. '
        + 'Example: `ccapb what are the results of Trinquet in 1ère Série?`',
    );
    return;
  }

  let provider;
  try {
    provider = createProvider(env, log,);
  } catch (err) {
    log.error({ err: String(err,), }, 'agent provider configuration error',);
    await postMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      `Agent not configured: ${String(err,)}`,
    );
    return;
  }

  await postMessage(
    env.SLACK_BOT_TOKEN,
    event.channel,
    '_Thinking… querying the Frontis database._',
  ).catch(() => {},);

  const agentQuestion = `League: ${parsed.league}\n\nQuestion: ${parsed.question}`;
  const channel = event.channel;
  const debugCallback = debugMode
    ? async (msg: string,) => {
      await postMessage(env.SLACK_BOT_TOKEN, channel, msg,);
    }
    : undefined;

  try {
    const answer = await runAgentWithTimeout(
      agentQuestion,
      env.FRONTIS_URL,
      provider,
      debugCallback,
      log,
    );
    await postMessage(env.SLACK_BOT_TOKEN, channel, answer,);
  } catch (err) {
    log.error({ err: String(err,), }, 'agent error in DM handler',);
    await postMessage(
      env.SLACK_BOT_TOKEN,
      channel,
      `Agent error: ${String(err,)}`,
    );
  }
}
