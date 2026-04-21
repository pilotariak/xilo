/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { createLogger, } from '../logger.js';
import type { Logger, } from '../logger.js';
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
): Promise<Response> {
  const log = createLogger(env, { handler: 'events', },);

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
    log.info(
      {
        retryNum: Number(retryNum,),
        eventId: payload.event_id ?? 'unknown',
        retryReason: request.headers.get('x-slack-retry-reason',) ?? 'unknown',
      },
      'dropping slack retry',
    );
    return new Response('OK', { status: 200, },);
  }

  // 3. Rate-limited notification — Slack sends this instead of real events
  //    when delivery exceeds 30,000 events/workspace/app per 60-minute window.
  if (payload.type === 'app_rate_limited') {
    log.warn(
      {
        teamId: payload.team_id,
        appId: payload.api_app_id,
        minute: payload.minute_rate_limited,
      },
      'app_rate_limited',
    );
    return new Response('OK', { status: 200, },);
  }

  // 4. Normal event — ack immediately, dispatch to queue for async processing.
  //    The queue consumer (queue.ts) runs independently with up to 15 min budget,
  //    so there is no risk of hitting the 30-second waitUntil limit.
  if (payload.type === 'event_callback' && payload.event) {
    await processEvent(payload, env, log,);
  }

  return new Response('OK', { status: 200, },);
}

async function processEvent(payload: SlackEventPayload, env: Env, log: Logger,): Promise<void> {
  const eventLog = log.child({ eventId: payload.event_id, },);
  const event = payload.event!;

  switch (event.type) {
    case 'app_mention':
      await handleMention(event, env, eventLog,);
      break;

    case 'message':
      // Only handle DMs; ignore bot messages to prevent infinite loops.
      if (!event.bot_id && event.channel_type === 'im') {
        await handleDirectMessage(event, env, eventLog,);
      }
      break;

    default:
      break;
  }
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
 * Detection order (first match wins):
 *  1. Explicit "league <code>" or "for <code>" pattern anywhere in the text
 *     (e.g. "@xilo for league lcapb what are the results…")
 *  2. First word is a league code: 4–8 lowercase letters that is not a common
 *     English/French stop word (e.g. "@xilo lcapb what are the results…")
 *  3. Fall back to the DEFAULT_LEAGUE env var when no code is found.
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

  // 1. Explicit keyword: "league lcapb" or "ligue lcapb"
  const explicitMatch = text.match(/\b(?:league|ligue)\s+([a-z]{2,8})\b/i,);
  if (explicitMatch) {
    return { league: explicitMatch[1].toLowerCase(), question: text, };
  }

  // 2. Preposition + code: "de lcapb", "du ccapb", "pour lcapb", "of lcapb", "for lcapb"
  //    Handles French natural-language queries like "liste des compétitions de lcapb".
  const PREP_ARTICLES = new Set([
    'la',
    'le',
    'les',
    'un',
    'une',
    'des',
    'du',
    'au',
    'aux',
    'son',
    'ses',
    'mon',
    'mes',
    'ton',
    'tes',
    'nos',
    'vos',
    'the',
    'and',
    'but',
    'not',
  ],);
  const prepMatch = text.match(/\b(?:de|du|pour|of|for)\s+([a-z]{3,8})\b/i,);
  if (prepMatch) {
    const candidate = prepMatch[1].toLowerCase();
    if (!PREP_ARTICLES.has(candidate,)) {
      return { league: candidate, question: text, };
    }
  }

  // 3. First word is a league code (5–8 lowercase letters).
  //    Handles "@xilo lcapb what are the results…" style mentions.
  //    Common French/English sentence starters are blocked to avoid false matches.
  const SENTENCE_STARTERS = new Set([
    'donne',
    'donnez',
    'liste',
    'listez',
    'montre',
    'montrez',
    'affiche',
    'afficher',
    'cherche',
    'cherchez',
    'trouver',
    'trouvez',
    'pouvez',
    'voulez',
    'merci',
    'bonjour',
    'bonsoir',
    'quels',
    'quelle',
    'quelles',
    'which',
    'where',
    'could',
    'would',
    'shall',
    'might',
    'their',
    'there',
    'these',
    'those',
    'please',
    'hello',
    'shows',
    'gives',
    'finds',
  ],);
  const spaceIdx = text.indexOf(' ',);
  const firstWord = spaceIdx >= 0 ? text.slice(0, spaceIdx,) : text;
  const rest = spaceIdx >= 0 ? text.slice(spaceIdx + 1,).trim() : '';
  if (/^[a-z]{5,8}$/.test(firstWord,) && rest && !SENTENCE_STARTERS.has(firstWord,)) {
    return { league: firstWord, question: rest, };
  }

  // 4. No league code found — fall back to the configured default.
  if (defaultLeague) {
    return { league: defaultLeague, question: text, };
  }

  return null;
}

/**
 * Dispatches a mention (@xilo ...) to AGENT_QUEUE and posts a "Thinking…" placeholder.
 *
 * Thread strategy: use event.thread_ts if the mention is already inside a
 * thread; otherwise use event.ts to start a new thread on that message.
 * The queue consumer (queue.ts) posts the actual answer once the agent completes.
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

  await postMessage(
    env.SLACK_BOT_TOKEN,
    event.channel,
    '_Thinking… querying the Frontis database._',
    undefined,
    threadTs,
  ).catch(() => {},);

  await env.AGENT_QUEUE.send({
    channel: event.channel,
    threadTs,
    league: parsed.league,
    question: parsed.question,
    debugMode,
  },);
}

/**
 * Dispatches a direct message to AGENT_QUEUE and posts a "Thinking…" placeholder.
 * The queue consumer (queue.ts) posts the actual answer once the agent completes.
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

  await postMessage(
    env.SLACK_BOT_TOKEN,
    event.channel,
    '_Thinking… querying the Frontis database._',
  ).catch(() => {},);

  await env.AGENT_QUEUE.send({
    channel: event.channel,
    league: parsed.league,
    question: parsed.question,
    debugMode,
  },);
}
