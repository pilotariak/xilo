/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { postMessage, } from '../slack/api.js';
import type { Env, SlackEventPayload, } from '../types.js';

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
  const event = payload.event!;

  switch (event.type) {
    case 'app_mention':
      if (event.channel && event.text) {
        await postMessage(
          env.SLACK_BOT_TOKEN,
          event.channel,
          `Hi <@${event.user}>! You mentioned me. Try \`/xilo help\` to see what I can do.`,
        );
      }
      break;

    case 'message':
      // Ignore bot messages to prevent infinite loops
      if (event.bot_id) { break; }
      break;

    default:
      break;
  }
}
