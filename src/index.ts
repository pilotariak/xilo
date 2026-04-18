/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import pkg from '../package.json';
import { handleSlashCommand, } from './handlers/commands.js';
import { handleEvent, } from './handlers/events.js';
import { errorResponse, } from './slack/response.js';
import { verifySlackSignature, } from './slack/verify.js';
import type { Env, SlackEventPayload, SlashCommandPayload, } from './types.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext,): Promise<Response> {
    const url = new URL(request.url,);

    // Public routes (no Slack signature required)
    if (url.pathname === '/version') {
      return handleVersion(request,);
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, },);
    }

    // Read raw body once — needed both for signature verification and parsing
    const body = await request.text();

    const isValid = await verifySlackSignature(request, body, env.SLACK_SIGNING_SECRET,);
    if (!isValid) {
      return errorResponse('Invalid Slack signature', 401,);
    }

    switch (url.pathname) {
      case '/slack/commands':
        return handleCommands(body, env, ctx,);

      case '/slack/events':
        return handleEvents(request, body, env, ctx,);

      default:
        return new Response('Not Found', { status: 404, },);
    }
  },
};

function handleVersion(request: Request,): Response {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, },);
  }
  return new Response(JSON.stringify({ version: pkg.version, },), {
    headers: { 'Content-Type': 'application/json', },
  },);
}

function handleCommands(body: string, env: Env, ctx: ExecutionContext,): Promise<Response> {
  const params = new URLSearchParams(body,);
  const payload = Object.fromEntries(params.entries(),) as unknown as SlashCommandPayload;
  return handleSlashCommand(payload, env, ctx,);
}

function handleEvents(
  request: Request,
  body: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const payload = JSON.parse(body,) as SlackEventPayload;
  return handleEvent(request, payload, env, ctx,);
}
