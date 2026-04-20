/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import pkg from '../../package.json';
import { createProvider, } from '../agent/providers/index.js';
import { runAgent, } from '../agent/runner.js';
import {
  listCategories,
  listClubs,
  listCompetitions,
  listResults,
  listSpecialties,
} from '../frontis/client.js';
import { createLogger, } from '../logger.js';
import { postMessage, sendDelayedResponse, } from '../slack/api.js';
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

    case '/ask':
      return handleAsk(payload, env, ctx,);

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
    '`/ask <league> <question>` — Ask a natural-language question (AI agent)',
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

async function handleAsk(
  payload: SlashCommandPayload,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const text = payload.text.trim();
  const spaceIdx = text.indexOf(' ',);
  if (spaceIdx < 0 || !text.slice(spaceIdx + 1,).trim()) {
    return ephemeralText(
      [
        'Usage: `/ask <league> <question>`',
        'Example: `/ask ccapb What are the results of "Trinquet / P.G. Pleine Masculin" in "1ère Série" for "Championnat CCAPB 2025-2026"?`',
      ].join('\n',),
    );
  }

  const league = text.slice(0, spaceIdx,);
  const rawQuestion = text.slice(spaceIdx + 1,).trim();
  const debugMode = /\(DEBUG=true\)/i.test(rawQuestion,);
  const question = rawQuestion.replace(/\s*\(DEBUG=true\)\s*/gi, ' ',).trim();

  const log = createLogger(env, {
    command: '/ask',
    user: payload.user_name,
    channel: payload.channel_name,
    league,
    debugMode,
  },);
  log.info('ask command received',);

  let provider;
  try {
    provider = createProvider(env, log,);
  } catch (err) {
    log.error({ err: String(err,), }, 'agent provider configuration error',);
    return ephemeralText(`Agent configuration error: ${String(err,)}`,);
  }

  const agentQuestion = `League: ${league}\n\nQuestion: ${question}`;
  const { response_url: responseUrl, channel_id: channelId, } = payload;

  // Debug messages are posted directly to the channel (postMessage) so they
  // don't count against the 5-call limit on response_url.
  const debugCallback = debugMode
    ? async (msg: string,) => {
      await postMessage(env.SLACK_BOT_TOKEN, channelId, msg,);
    }
    : undefined;

  // Acknowledge immediately (Slack requires a response within 3 seconds),
  // then run the agent asynchronously and post the answer via response_url.
  ctx.waitUntil(
    runAgent(agentQuestion, env.FRONTIS_URL, provider, debugCallback, log,)
      .then((answer,) => sendDelayedResponse(responseUrl, answer, 'ephemeral',))
      .catch((err,) => {
        log.error({ err: String(err,), }, 'agent error in ask command',);
        return sendDelayedResponse(responseUrl, `Agent error: ${String(err,)}`, 'ephemeral',);
      },),
  );

  return ephemeralText('_Thinking…_ I am querying the Frontis database for you.',);
}
