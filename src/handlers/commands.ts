/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import pkg from '../../package.json';
import {
  listCategories,
  listClubs,
  listCompetitions,
  listResults,
  listSpecialties,
} from '../frontis/client.js';
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

    case '/categories':
      return handleCategories(env.FRONTIS_URL, payload.text.trim(),);

    case '/specialties':
      return handleSpecialties(env.FRONTIS_URL, payload.text.trim(),);

    case '/clubs':
      return handleClubs(env.FRONTIS_URL, payload.text.trim(),);

    case '/competitions':
      return handleCompetitions(env.FRONTIS_URL, payload.text.trim(),);

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
    '`/categories <league>` — List all player categories for a league',
    '`/specialties <league>` — List all Basque pelota disciplines (e.g. `lcapb`)',
    '`/clubs <league>` — List all clubs for a league',
    '`/competitions <league>` — List all competitions for a league',
    '`/results <league> [competitionId=x] [specialtyId=x] [categoryId=x] [phase=x]` — List match results',
  ].join('\n',);
}

async function handleCategories(gatewayUrl: string, text: string,): Promise<Response> {
  const [league,] = text.split(/\s+/,);
  if (!league) {
    return ephemeralText('Usage: `/categories <league>`\nExample: `/categories lcapb`',);
  }
  try {
    const categories = await listCategories(gatewayUrl, league,);
    if (categories.length === 0) {
      return ephemeralText('No categories found.',);
    }
    const lines = categories.map((c,) => `• *${c.name}* (id: \`${c.id}\`)`);
    return ephemeralText(['*Categories*', ...lines,].join('\n',),);
  } catch (err) {
    return ephemeralText(`Failed to fetch categories: ${String(err,)}`,);
  }
}

async function handleSpecialties(gatewayUrl: string, text: string,): Promise<Response> {
  const [league,] = text.split(/\s+/,);
  if (!league) {
    return ephemeralText('Usage: `/specialties <league>`\nExample: `/specialties lcapb`',);
  }
  try {
    const specialties = await listSpecialties(gatewayUrl, league,);
    if (specialties.length === 0) {
      return ephemeralText('No specialties found.',);
    }
    const lines = specialties.map((s,) => `• *${s.name}* (id: \`${s.id}\`)`);
    return ephemeralText(['*Pelota Specialties*', ...lines,].join('\n',),);
  } catch (err) {
    return ephemeralText(`Failed to fetch specialties: ${String(err,)}`,);
  }
}

async function handleClubs(gatewayUrl: string, text: string,): Promise<Response> {
  const [league,] = text.split(/\s+/,);
  if (!league) {
    return ephemeralText('Usage: `/clubs <league>`\nExample: `/clubs lcapb`',);
  }
  try {
    const clubs = await listClubs(gatewayUrl, league,);
    if (clubs.length === 0) {
      return ephemeralText('No clubs found.',);
    }
    const lines = clubs.map((c,) => `• *${c.name}* (id: \`${c.id}\`)`);
    return ephemeralText(['*Pelota Clubs*', ...lines,].join('\n',),);
  } catch (err) {
    return ephemeralText(`Failed to fetch clubs: ${String(err,)}`,);
  }
}

async function handleCompetitions(gatewayUrl: string, text: string,): Promise<Response> {
  const [league,] = text.split(/\s+/,);
  if (!league) {
    return ephemeralText('Usage: `/competitions <league>`\nExample: `/competitions lcapb`',);
  }
  try {
    const competitions = await listCompetitions(gatewayUrl, league,);
    if (competitions.length === 0) {
      return ephemeralText('No competitions found.',);
    }
    const lines = competitions.map((c,) => `• *${c.name}* (id: \`${c.id}\`)`);
    return ephemeralText(['*Competitions*', ...lines,].join('\n',),);
  } catch (err) {
    return ephemeralText(`Failed to fetch competitions: ${String(err,)}`,);
  }
}

function parseResultsArgs(text: string,): {
  league: string | undefined;
  filters: { competitionId?: string; specialtyId?: string; categoryId?: string; phase?: string; };
} {
  const [league, ...rest] = text.split(/\s+/,);
  const filters: {
    competitionId?: string;
    specialtyId?: string;
    categoryId?: string;
    phase?: string;
  } = {};
  for (const token of rest) {
    const eq = token.indexOf('=',);
    if (eq > 0) {
      const key = token.slice(0, eq,);
      const val = token.slice(eq + 1,);
      if (
        key === 'competitionId' || key === 'specialtyId' || key === 'categoryId' || key === 'phase'
      ) {
        filters[key] = val;
      }
    }
  }
  return { league: league || undefined, filters, };
}

async function handleResults(gatewayUrl: string, text: string,): Promise<Response> {
  const { league, filters, } = parseResultsArgs(text,);
  if (!league) {
    return ephemeralText(
      [
        'Usage: `/results <league> [competitionId=x] [specialtyId=x] [categoryId=x]`',
        'Example: `/results lcapb competitionId=72 categoryId=1`',
      ].join('\n',),
    );
  }
  try {
    const results = await listResults(gatewayUrl, league, filters,);
    if (results.length === 0) {
      return ephemeralText('No results found.',);
    }
    const lines = results.map((r,) => {
      const date = r.dateMatch ?? '?';
      const phaseLabel = r.phase ? ` [${r.phase}]` : '';
      const score = r.scores ?? '?';
      const categoryLabel = r.category ? ` — ${r.category.name}` : '';
      return `• ${date}${phaseLabel} — *${r.clubA.name}* vs *${r.clubB.name}* ${score} (${r.specialty.name}${categoryLabel})`;
    },);
    return ephemeralText(['*Results*', ...lines,].join('\n',),);
  } catch (err) {
    return ephemeralText(`Failed to fetch results: ${String(err,)}`,);
  }
}
