/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import pkg from '../../package.json';
import { listClubs, listCompetitions, listResults, listSpecialties, } from '../frontis/client.js';
import { channelText, ephemeralText, } from '../slack/response.js';
import type { Env, SlashCommandPayload, } from '../types.js';

/**
 * Routes incoming slash commands to their respective handlers.
 */
export async function handleSlashCommand(
  payload: SlashCommandPayload,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  switch (payload.command) {
    case '/help':
      return ephemeralText(buildHelpText(),);

    case '/version':
      return ephemeralText(`Xilo version: \`${pkg.version}\``,);

    case '/ping':
      return channelText(`Hello @${payload.user_name}!`,);

    case '/specialties':
      return handleSpecialties(env.FRONTIS_URL,);

    case '/clubs':
      return handleClubs(env.FRONTIS_URL,);

    case '/competitions':
      return handleCompetitions(env.FRONTIS_URL,);

    case '/results':
      return handleResults(env.FRONTIS_URL, payload.text.trim(),);

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
    '`/specialties` — List all Basque pelota disciplines',
    '`/clubs` — List all clubs',
    '`/competitions` — List all competitions',
    '`/results <competitionId> [phase]` — List match results for a competition',
  ].join('\n',);
}

async function handleSpecialties(gatewayUrl: string,): Promise<Response> {
  try {
    const specialties = await listSpecialties(gatewayUrl,);
    if (specialties.length === 0) {
      return ephemeralText('No specialties found.',);
    }
    const lines = specialties.map((s,) => `• *${s.name}* (id: \`${s.id}\`)`);
    return ephemeralText(['*Pelota Specialties*', ...lines,].join('\n',),);
  } catch (err) {
    return ephemeralText(`Failed to fetch specialties: ${String(err,)}`,);
  }
}

async function handleClubs(gatewayUrl: string,): Promise<Response> {
  try {
    const clubs = await listClubs(gatewayUrl,);
    if (clubs.length === 0) {
      return ephemeralText('No clubs found.',);
    }
    const lines = clubs.map((c,) => `• *${c.name}* (id: \`${c.id}\`)`);
    return ephemeralText(['*Pelota Clubs*', ...lines,].join('\n',),);
  } catch (err) {
    return ephemeralText(`Failed to fetch clubs: ${String(err,)}`,);
  }
}

async function handleCompetitions(gatewayUrl: string,): Promise<Response> {
  try {
    const competitions = await listCompetitions(gatewayUrl,);
    if (competitions.length === 0) {
      return ephemeralText('No competitions found.',);
    }
    const lines = competitions.map((c,) => `• *${c.name}* (id: \`${c.id}\`)`);
    return ephemeralText(['*Competitions*', ...lines,].join('\n',),);
  } catch (err) {
    return ephemeralText(`Failed to fetch competitions: ${String(err,)}`,);
  }
}

async function handleResults(gatewayUrl: string, text: string,): Promise<Response> {
  const [competitionId, phase,] = text.split(/\s+/,);
  if (!competitionId) {
    return ephemeralText(
      'Usage: `/results <competitionId> [phase]`\nExample: `/results 42 Finale`',
    );
  }
  try {
    const results = await listResults(gatewayUrl, { competitionId, phase: phase ?? undefined, },);
    if (results.length === 0) {
      return ephemeralText(`No results found for competition \`${competitionId}\`.`,);
    }
    const lines = results.map((r,) => {
      const date = r.dateMatch ?? '?';
      const phaseLabel = r.phase ? ` [${r.phase}]` : '';
      const score = r.scores ?? '?';
      return `• ${date}${phaseLabel} — *${r.clubA.name}* vs *${r.clubB.name}* ${score} (${r.specialty.name})`;
    },);
    return ephemeralText(
      [`*Results for competition \`${competitionId}\`*`, ...lines,].join('\n',),
    );
  } catch (err) {
    return ephemeralText(`Failed to fetch results: ${String(err,)}`,);
  }
}
