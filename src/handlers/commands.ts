/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import pkg from '../../package.json';
import { channelText, ephemeralText, } from '../slack/response.js';
import type { Env, SlashCommandPayload, } from '../types.js';

/**
 * Routes incoming slash commands to their respective handlers.
 */
export async function handleSlashCommand(
  payload: SlashCommandPayload,
  _env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  switch (payload.command) {
    case '/help':
      return ephemeralText(buildHelpText(),);

    case '/version':
      return ephemeralText(`Xilo version: \`${pkg.version}\``,);

    case '/ping':
      return channelText(`Hello @${payload.user_name}!`,);

    default:
      return ephemeralText(
        `Unknown command: \`${payload.command}\`. Try \`/help\` for a list of commands.`,
      );
  }
}

function buildHelpText(): string {
  return [
    '*Xilo Bot Commands*',
    '`/help` — Show this help message',
    '`/version` — Show the Xilo bot version',
    '`/ping` — Say hello to the channel',
  ].join('\n',);
}
