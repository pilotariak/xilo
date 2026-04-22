/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import pkg from '../package.json';
import { handleSlashCommand, } from './handlers/commands.js';
import { handleEvent, } from './handlers/events.js';
import { handleInteractive, } from './handlers/interactive.js';
import { handleLanding, } from './handlers/landing.js';
import { handleQueue, } from './handlers/queue.js';
import { errorResponse, } from './slack/response.js';
import { verifySlackSignature, } from './slack/verify.js';
import type { AgentJob, Env, SlackEventPayload, SlashCommandPayload, } from './types.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext,): Promise<Response> {
    const url = new URL(request.url,);

    // Public routes (no Slack signature required)
    if (url.pathname === '/') {
      return handleLanding(request,);
    }

    if (url.pathname === '/version') {
      return handleVersion(request,);
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, },);
    }

    // Read raw body once — needed both for signature verification and parsing
    const body = await request.text();

    // Handle Slack's url_verification challenge before signature check.
    // This is a one-time setup handshake: Slack sends it to confirm the
    // endpoint is reachable before the app is fully configured with a
    // signing secret. Echoing the challenge is safe — no auth is needed
    // because the response carries no sensitive data.
    if (url.pathname === '/slack/events') {
      try {
        const probe = JSON.parse(body,) as { type?: string; challenge?: string; };
        if (probe.type === 'url_verification' && probe.challenge) {
          return new Response(JSON.stringify({ challenge: probe.challenge, },), {
            headers: { 'Content-Type': 'application/json', },
          },);
        }
      } catch {
        // Not JSON — fall through to normal signature-verified handling
      }
    }

    const isValid = await verifySlackSignature(request, body, env.SLACK_SIGNING_SECRET,);
    if (!isValid) {
      return errorResponse('Invalid Slack signature', 401,);
    }

    switch (url.pathname) {
      case '/slack/commands':
        return handleCommands(body, env, ctx,);

      case '/slack/events':
        return handleEvents(request, body, env,);

      case '/slack/interactive':
        return handleInteractive(body, env, ctx,);

      default:
        return new Response('Not Found', { status: 404, },);
    }
  },

  async queue(batch: MessageBatch<AgentJob>, env: Env,): Promise<void> {
    return handleQueue(batch, env,);
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

function handleEvents(request: Request, body: string, env: Env,): Promise<Response> {
  const payload = JSON.parse(body,) as SlackEventPayload;
  return handleEvent(request, payload, env,);
}
