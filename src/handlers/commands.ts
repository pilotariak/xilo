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
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  switch (payload.command) {
    case '/xilo':
      return handleXilo(payload, env, ctx,);
    default:
      return ephemeralText(`Unknown command: ${payload.command}`,);
  }
}

/**
 * /xilo - Main command for the Xilo bot.
 *
 * Subcommands:
 *   /xilo help       - Show available commands
 *   /xilo version    - Show Xilo version
 *   /xilo ping       - Greet the user who called the command
 */
async function handleXilo(
  payload: SlashCommandPayload,
  _env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const [subcommand,] = payload.text.trim().split(/\s+/,);

  switch (subcommand) {
    case '':
    case 'help':
      return ephemeralText(buildHelpText(),);

    case 'version':
      return ephemeralText(`Xilo version: \`${pkg.version}\``,);

    case 'ping':
      return channelText(`Hello @${payload.user_name}!`,);

    default:
      return ephemeralText(
        `Unknown subcommand \`${subcommand}\`. Try \`/xilo help\` for a list of commands.`,
      );
  }
}

function buildHelpText(): string {
  return [
    '*Xilo Bot Commands*',
    '`/xilo help` — Show this help message',
    '`/xilo version` — Show the Xilo bot version',
    '`/xilo ping` — Say hello to the channel',
  ].join('\n',);
}
