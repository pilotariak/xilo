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
 * The Events API uses a challenge/response handshake during app setup,
 * then sends JSON event objects for subscribed events.
 */
export async function handleEvent(
  payload: SlackEventPayload,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // URL verification challenge (Slack sends this once during app setup)
  if (payload.type === 'url_verification') {
    return new Response(JSON.stringify({ challenge: payload.challenge, },), {
      headers: { 'Content-Type': 'application/json', },
    },);
  }

  if (payload.type === 'event_callback' && payload.event) {
    // Process the event asynchronously so Slack gets the 200 OK within 3 seconds
    ctx.waitUntil(processEvent(payload, env,),);
  }

  return new Response('OK', { status: 200, },);
}

async function processEvent(payload: SlackEventPayload, env: Env,): Promise<void> {
  const event = payload.event!;

  switch (event.type) {
    case 'app_mention':
      // Bot was @mentioned
      if (event.channel && event.text) {
        await postMessage(
          env.SLACK_BOT_TOKEN,
          event.channel,
          `Hi <@${event.user}>! You mentioned me. Try \`/xilo help\` to see what I can do.`,
        );
      }
      break;

    case 'message':
      // Ignore bot messages to avoid infinite loops
      if (event.bot_id) { break; }
      break;

    default:
      break;
  }
}
