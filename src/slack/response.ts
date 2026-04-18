/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { SlackMessage, } from '../types.js';

/**
 * Creates a JSON HTTP response for Slack slash commands.
 * Slack requires an immediate response within 3 seconds.
 */
export function slackResponse(message: SlackMessage, status = 200,): Response {
  return new Response(JSON.stringify(message,), {
    status,
    headers: { 'Content-Type': 'application/json', },
  },);
}

export function ephemeralText(text: string,): Response {
  return slackResponse({ response_type: 'ephemeral', text, },);
}

export function channelText(text: string,): Response {
  return slackResponse({ response_type: 'in_channel', text, },);
}

export function errorResponse(message: string, status = 400,): Response {
  return new Response(message, { status, },);
}
