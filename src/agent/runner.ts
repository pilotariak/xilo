/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { Category, Competition, Result, Specialty, } from '../frontis/client.js';
import {
  GRAPHQL_QUERIES,
  listCategories,
  listClubs,
  listCompetitions,
  listResults,
  listSpecialties,
} from '../frontis/client.js';
import type { Logger, } from '../logger.js';
import { TOOL_DEFINITIONS, } from './tools.js';
import type { AgentMessage, AgentProvider, ToolCall, } from './types.js';

/** Maximum LLM→tool→LLM iterations before giving up. */
const MAX_ITERATIONS = 6;
/** Inject a wrap-up warning when this many iterations remain. */
const WARN_AT_REMAINING = 2;

const SYSTEM_PROMPT =
  `You are Xilo, a helpful assistant for the Pilotariak Basque pelota sports platform.

The user's message contains a CONTEXT BLOCK listing all available competitions, specialties, and categories
for the requested league, each with their database ID. Use that block to resolve names to IDs.

Your job:
1. Read the CONTEXT BLOCK carefully.
2. Match the competition, specialty, and category requested by the user to entries in the CONTEXT BLOCK.
3. If a clear match is found: call list_results immediately with those IDs.
4. If a match is ambiguous, list the options and ask the user to choose.
5. Present the results clearly: date, phase, club A vs club B, score, specialty, category.

Always answer in the same language as the user's question (French, Basque, Spanish, or English).
Be concise and well-formatted.`;

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

type QueryIntent =
  | 'list_competitions'
  | 'list_specialties'
  | 'list_categories'
  | 'list_clubs'
  | 'list_results'
  | 'unknown';

/**
 * Classifies the user's intent from the question text using keyword matching.
 *
 * Order matters: "results" is checked first because a query like
 * "results of competition X in category Y" mentions "competition" too,
 * but the primary intent is to fetch results.
 */
function detectIntent(question: string,): QueryIntent {
  const q = norm(question,);

  if (/\b(?:resultat|result|score|match|partie|rencontre)/.test(q,)) {
    return 'list_results';
  }
  if (/\b(?:competition|championnat|tournoi|saison)/.test(q,)) {
    return 'list_competitions';
  }
  if (/\b(?:specialit|specialte|discipline|trinquet|cesta|fronton)/.test(q,)) {
    return 'list_specialties';
  }
  if (/\b(?:categori|serie|division|niveau)/.test(q,)) {
    return 'list_categories';
  }
  if (/\b(?:club|equipe|team)/.test(q,)) {
    return 'list_clubs';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Runs the agent for a natural-language sports query.
 *
 * Strategy:
 *  1. Detect intent from the question (competitions? specialties? results?).
 *  2. For list intents: call the single matching GraphQL endpoint directly.
 *  3. For results intent: pre-fetch lookup tables, resolve IDs deterministically
 *     (with LLM fallback), then call list_results.
 *  4. Unknown intent: fall back to the full LLM agent loop.
 */
export async function runAgent(
  question: string,
  gatewayUrl: string,
  provider: AgentProvider,
  debugCallback?: (text: string,) => Promise<void>,
  log?: Logger,
): Promise<string> {
  const runLog = log
    ? log.child({ module: 'agent/runner', },)
    : { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, } as unknown as Logger;

  runLog.info({ question, }, 'agent started',);

  const leagueMatch = question.match(/^League:\s*(\S+)/,);
  const league = leagueMatch?.[1];

  if (league) {
    const intent = detectIntent(question,);
    runLog.info({ league, intent, }, 'intent detected',);

    // --- Direct list intents (single GraphQL call, no ID resolution needed) ---

    if (intent === 'list_competitions') {
      try {
        const items = await listCompetitions(gatewayUrl, league,);
        return formatList('Competitions', items,);
      } catch (err) {
        runLog.error({ err: String(err,), }, 'list_competitions failed',);
        return `Error fetching competitions: ${String(err,)}`;
      }
    }

    if (intent === 'list_specialties') {
      try {
        const items = await listSpecialties(gatewayUrl, league,);
        return formatList('Spécialités', items,);
      } catch (err) {
        runLog.error({ err: String(err,), }, 'list_specialties failed',);
        return `Error fetching specialties: ${String(err,)}`;
      }
    }

    if (intent === 'list_categories') {
      try {
        const items = await listCategories(gatewayUrl, league,);
        return formatList('Catégories', items,);
      } catch (err) {
        runLog.error({ err: String(err,), }, 'list_categories failed',);
        return `Error fetching categories: ${String(err,)}`;
      }
    }

    if (intent === 'list_clubs') {
      try {
        const items = await listClubs(gatewayUrl, league,);
        return formatList('Clubs', items,);
      } catch (err) {
        runLog.error({ err: String(err,), }, 'list_clubs failed',);
        return `Error fetching clubs: ${String(err,)}`;
      }
    }

    // --- Results intent: resolve filters, then call list_results ---

    if (intent === 'list_results') {
      const { competitions, specialties, categories, } = await prefetchLeagueData(
        gatewayUrl,
        league,
        runLog,
      );

      // Step 1: instant deterministic resolution (no LLM, no network).
      const detCompetition = resolveItemDeterministic(question, competitions,);
      const detSpecialty = resolveItemDeterministic(question, specialties,);
      const detCategory = resolveItemDeterministic(question, categories,);

      runLog.info(
        {
          competitionDet: detCompetition?.name,
          specialtyDet: detSpecialty?.name,
          categoryDet: detCategory?.name,
        },
        'deterministic resolution',
      );

      // Step 2: LLM fallback only for dimensions that didn't resolve deterministically.
      const needsLLM = !detCompetition || !detSpecialty || !detCategory;
      const [competition, specialty, category,] = needsLLM
        ? await Promise.all([
          detCompetition
            ?? resolveWithLLM(question, competitions, 'competition', provider, runLog,),
          detSpecialty ?? resolveWithLLM(question, specialties, 'specialty', provider, runLog,),
          detCategory ?? resolveWithLLM(question, categories, 'category', provider, runLog,),
        ],)
        : [detCompetition, detSpecialty, detCategory,];

      const resolved: ResolvedFilters = {
        competitionId: competition?.id,
        competitionName: competition?.name,
        specialtyId: specialty?.id,
        specialtyName: specialty?.name,
        categoryId: category?.id,
        categoryName: category?.name,
      };
      runLog.info({ resolved, }, 'filter resolution',);

      if (resolved.competitionId || resolved.specialtyId || resolved.categoryId) {
        const filters = {
          competitionId: resolved.competitionId,
          specialtyId: resolved.specialtyId,
          categoryId: resolved.categoryId,
        };
        runLog.info(
          { league, filters, query: GRAPHQL_QUERIES['list_results']?.trim(), },
          'graphql request',
        );
        try {
          const results = await listResults(gatewayUrl, league, filters,);
          runLog.info({ count: results.length, }, 'direct results fetched',);
          if (debugCallback) {
            await debugCallback(formatDirectDebug(league, filters, results,),).catch(() => {},);
          }
          return formatResultsText(results, resolved,);
        } catch (err) {
          runLog.error({ err: String(err,), }, 'list_results failed, falling back to LLM loop',);
        }
      }

      // No filters resolved — fall back to LLM loop with enriched context.
      const enrichedQuestion = buildContextBlock(question, competitions, specialties, categories,);
      return llmAgentLoop(enrichedQuestion, gatewayUrl, provider, runLog, debugCallback,);
    }

    // --- Unknown intent: full LLM agent loop ---
    return llmAgentLoop(question, gatewayUrl, provider, runLog, debugCallback,);
  }

  return llmAgentLoop(question, gatewayUrl, provider, runLog, debugCallback,);
}

// ---------------------------------------------------------------------------
// ID resolution
// ---------------------------------------------------------------------------

interface ResolvedFilters {
  competitionId?: string;
  competitionName?: string;
  specialtyId?: string;
  specialtyName?: string;
  categoryId?: string;
  categoryName?: string;
}

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
function norm(s: string,): string {
  return s
    .toLowerCase()
    .normalize('NFD',)
    .replace(/[\u0300-\u036f]/g, '',) // è→e, é→e, ñ→n …
    .replace(/[^\w\s]/g, ' ',) // punctuation → space
    .replace(/\s+/g, ' ',)
    .trim();
}

type NamedItem = { id: string; name: string; };

/**
 * Asks the LLM to pick the best-matching item from a short list.
 *
 * One focused prompt, no tools, no iteration — even small models reliably
 * handle "pick the best item from this list" as a classification task.
 *
 * Falls back to deterministic substring matching if the LLM response cannot
 * be parsed as a valid ID from the list.
 */
async function resolveWithLLM(
  question: string,
  items: NamedItem[],
  kind: 'competition' | 'specialty' | 'category',
  provider: AgentProvider,
  log: Logger,
): Promise<NamedItem | undefined> {
  if (items.length === 0) { return undefined; }
  if (items.length === 1) { return items[0]; }

  const listText = items.map((item,) => `- id=${item.id}: "${item.name}"`).join('\n',);
  const prompt = `Here is a list of Basque pelota ${kind}s:\n${listText}\n\n`
    + `User question: "${question}"\n\n`
    + `Which ${kind} ID best matches the user question? `
    + `Reply with ONLY the numeric ID (e.g. 72), nothing else. `
    + `If none match, reply with "none".`;

  log.info({ kind, itemCount: items.length, }, `asking LLM to resolve ${kind}`,);

  const response = await provider.complete(
    `You identify which Basque pelota ${kind} a user is asking about. `
      + 'Reply with ONLY the numeric ID from the list provided.',
    [{ role: 'user', content: prompt, },],
    [], // no tools — pure text extraction
  );

  if (response.type === 'text' && response.content) {
    const idMatch = response.content.match(/\b(\d+)\b/,);
    if (idMatch) {
      const found = items.find((item,) => item.id === idMatch[1]);
      if (found) {
        log.info({ kind, id: found.id, name: found.name, }, `LLM resolved ${kind}`,);
        return found;
      }
    }
  }

  // LLM response unparseable — fall back to normalized substring matching.
  log.warn(
    {
      kind,
      llmResponse: response.type === 'text' ? response.content.slice(0, 80,) : '(tool_calls)',
    },
    `LLM ${kind} resolution failed, using deterministic fallback`,
  );
  return resolveItemDeterministic(question, items,);
}

/** Normalized substring fallback: find the item whose name appears in the question. */
function resolveItemDeterministic(question: string, items: NamedItem[],): NamedItem | undefined {
  const q = norm(question,);
  return items.find((item,) => {
    const n = norm(item.name,);
    return q.includes(n,)
      || n.split(' ',).filter((w,) => w.length > 3).every((w,) => q.includes(w,));
  },);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Generic list formatter — used for competitions, specialties, categories, clubs. */
function formatList(title: string, items: NamedItem[],): string {
  if (items.length === 0) { return `*${title}*\nAucun résultat trouvé.`; }
  const lines = items.map((item,) => `• *${item.name}*`);
  return [`*${title}*`, ...lines,].join('\n',);
}

/**
 * Formats a list of Frontis results as a Slack-ready text block.
 * Called on the fast path — no LLM involved.
 */
function formatResultsText(results: Result[], resolved: ResolvedFilters,): string {
  const headerParts: string[] = [];
  if (resolved.specialtyName) { headerParts.push(resolved.specialtyName,); }
  if (resolved.categoryName) { headerParts.push(resolved.categoryName,); }
  if (resolved.competitionName) { headerParts.push(resolved.competitionName,); }
  const header = headerParts.length > 0
    ? `*Résultats — ${headerParts.join(' | ',)}*`
    : '*Résultats*';

  if (results.length === 0) {
    return `${header}\nAucun résultat trouvé pour ces critères.`;
  }

  const lines = [header,];
  for (const r of results) {
    const date = r.dateMatch ?? '?';
    const phase = r.phase ? ` [${r.phase}]` : '';
    const score = r.scores ?? '?';
    const cat = r.category ? ` — ${r.category.name}` : '';
    lines.push(
      `• ${date}${phase} — *${r.clubA.name}* vs *${r.clubB.name}* ${score} (${r.specialty.name}${cat})`,
    );
  }
  return lines.join('\n',);
}

// ---------------------------------------------------------------------------
// Pre-fetching
// ---------------------------------------------------------------------------

interface LeagueData {
  competitions: Competition[];
  specialties: Specialty[];
  categories: Category[];
}

async function prefetchLeagueData(
  gatewayUrl: string,
  league: string,
  log: Logger,
): Promise<LeagueData> {
  log.info({ league, }, 'pre-fetching league context',);

  const [competitions, specialties, categories,] = await Promise.all([
    listCompetitions(gatewayUrl, league,).catch((err,) => {
      log.warn({ league, err: String(err,), }, 'pre-fetch competitions failed',);
      return [] as Competition[];
    },),
    listSpecialties(gatewayUrl, league,).catch((err,) => {
      log.warn({ league, err: String(err,), }, 'pre-fetch specialties failed',);
      return [] as Specialty[];
    },),
    listCategories(gatewayUrl, league,).catch((err,) => {
      log.warn({ league, err: String(err,), }, 'pre-fetch categories failed',);
      return [] as Category[];
    },),
  ],);

  log.info(
    {
      competitions: competitions.length,
      specialties: specialties.length,
      categories: categories.length,
    },
    'pre-fetch complete',
  );

  return { competitions, specialties, categories, };
}

/**
 * Appends a structured CONTEXT BLOCK to the question.
 * Used as input for the LLM fallback loop.
 */
function buildContextBlock(
  question: string,
  competitions: Competition[],
  specialties: Specialty[],
  categories: Category[],
): string {
  const lines: string[] = ['', '--- CONTEXT BLOCK (use these IDs to answer the question) ---',];

  if (competitions.length > 0) {
    lines.push('Competitions:',);
    for (const c of competitions) { lines.push(`  - "${c.name}" → id=${c.id}`,); }
  }
  if (specialties.length > 0) {
    lines.push('Specialties:',);
    for (const s of specialties) { lines.push(`  - "${s.name}" → id=${s.id}`,); }
  }
  if (categories.length > 0) {
    lines.push('Categories:',);
    for (const c of categories) { lines.push(`  - "${c.name}" → id=${c.id}`,); }
  }

  lines.push('--- END CONTEXT BLOCK ---',);
  return question + lines.join('\n',);
}

// ---------------------------------------------------------------------------
// LLM agent loop (fallback)
// ---------------------------------------------------------------------------

async function llmAgentLoop(
  question: string,
  gatewayUrl: string,
  provider: AgentProvider,
  runLog: Logger,
  debugCallback?: (text: string,) => Promise<void>,
): Promise<string> {
  const messages: AgentMessage[] = [{ role: 'user', content: question, },];
  const toolCache = new Map<string, string>();
  let lastText: string | undefined;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    runLog.debug({ iteration: i + 1, }, 'agent iteration',);

    const response = await provider.complete(SYSTEM_PROMPT, messages, TOOL_DEFINITIONS,);

    if (response.type === 'text') {
      runLog.info({ iteration: i + 1, answerLength: response.content.length, }, 'agent completed',);
      return response.content || 'No answer found.';
    }

    if (response.partialText) { lastText = response.partialText; }

    runLog.info(
      { iteration: i + 1, toolCalls: response.calls.map((c,) => c.name), },
      'tool calls requested',
    );

    messages.push({ role: 'assistant_tool_calls', toolCalls: response.calls, },);

    const results = await Promise.all(
      response.calls.map(async (call,) => {
        const cacheKey = `${call.name}:${JSON.stringify(call.arguments,)}`;
        let content = toolCache.get(cacheKey,);
        if (content === undefined) {
          runLog.debug({ tool: call.name, args: call.arguments, }, 'executing tool',);
          content = await executeTool(call, gatewayUrl, runLog,);
          toolCache.set(cacheKey, content,);
          runLog.debug({ tool: call.name, responseBytes: content.length, }, 'tool executed',);
          if (debugCallback) {
            await debugCallback(formatDebug(call, content,),).catch(() => {},);
          }
        } else {
          runLog.debug({ tool: call.name, }, 'tool cache hit',);
        }
        return { toolCallId: call.id, toolName: call.name, content, };
      },),
    );

    const remaining = MAX_ITERATIONS - (i + 1);
    const wrapUpHint = remaining <= WARN_AT_REMAINING
      ? `⚠️ You have ${remaining} iteration(s) left. Stop calling tools and write your final answer now.`
      : undefined;

    messages.push({ role: 'tool_results', results, wrapUpHint, },);
  }

  runLog.warn(
    { iterations: MAX_ITERATIONS, hadPartialResponse: !!lastText, },
    'agent loop limit reached',
  );

  return (
    lastText
      ?? 'I was unable to find the answer after several attempts. '
        + 'Try rephrasing, or use the explicit slash commands (`/competitions`, `/results`, etc.).'
  );
}

// ---------------------------------------------------------------------------
// Debug formatting
// ---------------------------------------------------------------------------

const MAX_DEBUG_RESPONSE_CHARS = 1500;

function formatDirectDebug(
  league: string,
  filters: { competitionId?: string; specialtyId?: string; categoryId?: string; },
  results: Result[],
): string {
  const query = GRAPHQL_QUERIES['list_results'];
  const truncated = JSON.stringify(results,).length > MAX_DEBUG_RESPONSE_CHARS
    ? JSON.stringify(results,).slice(0, MAX_DEBUG_RESPONSE_CHARS,) + '\n… *(truncated)*'
    : JSON.stringify(results, null, 2,);
  return [
    `🔍 *\`list_results\`* _(deterministic)_ — league: \`${league}\``,
    `*GraphQL request:*\n\`\`\`\n${query?.trim()}\n\`\`\``,
    `*Variables:*\n\`\`\`json\n${JSON.stringify(filters, null, 2,)}\n\`\`\``,
    `*Response:*\n\`\`\`json\n${truncated}\n\`\`\``,
  ].join('\n',);
}

function formatDebug(call: ToolCall, result: string,): string {
  const query = GRAPHQL_QUERIES[call.name];
  const { league, ...gqlVariables } = call.arguments;

  const truncated = result.length > MAX_DEBUG_RESPONSE_CHARS
    ? result.slice(0, MAX_DEBUG_RESPONSE_CHARS,) + '\n… *(truncated)*'
    : result;

  const parts: string[] = [`🔍 *\`${call.name}\`* — league: \`${String(league ?? '?',)}\``,];
  if (query) { parts.push(`*GraphQL request:*\n\`\`\`\n${query.trim()}\n\`\`\``,); }
  if (Object.keys(gqlVariables,).length > 0) {
    parts.push(`*Variables:*\n\`\`\`json\n${JSON.stringify(gqlVariables, null, 2,)}\n\`\`\``,);
  }
  parts.push(`*Response:*\n\`\`\`json\n${truncated}\n\`\`\``,);
  return parts.join('\n',);
}

// ---------------------------------------------------------------------------
// Tool execution (LLM loop path only)
// ---------------------------------------------------------------------------

async function executeTool(call: ToolCall, gatewayUrl: string, log: Logger,): Promise<string> {
  const args = call.arguments;
  const league = String(args['league'] ?? '',);

  const query = GRAPHQL_QUERIES[call.name];
  const { league: _league, ...gqlVariables } = args;
  log.info(
    {
      tool: call.name,
      league,
      query: query?.trim(),
      variables: Object.keys(gqlVariables,).length > 0 ? gqlVariables : undefined,
    },
    'graphql request',
  );

  try {
    switch (call.name) {
      case 'list_competitions': {
        const data = await listCompetitions(gatewayUrl, league,);
        return JSON.stringify(data,);
      }
      case 'list_specialties': {
        const data = await listSpecialties(gatewayUrl, league,);
        return JSON.stringify(data,);
      }
      case 'list_categories': {
        const data = await listCategories(gatewayUrl, league,);
        return JSON.stringify(data,);
      }
      case 'list_clubs': {
        const data = await listClubs(gatewayUrl, league,);
        return JSON.stringify(data,);
      }
      case 'list_results': {
        const filters = {
          competitionId: args['competitionId'] ? String(args['competitionId'],) : undefined,
          specialtyId: args['specialtyId'] ? String(args['specialtyId'],) : undefined,
          categoryId: args['categoryId'] ? String(args['categoryId'],) : undefined,
          phase: args['phase'] ? String(args['phase'],) : undefined,
        };
        const data = await listResults(gatewayUrl, league, filters,);
        return JSON.stringify(data,);
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${call.name}`, },);
    }
  } catch (err) {
    log.error({ tool: call.name, league, err: String(err,), }, 'graphql request failed',);
    return JSON.stringify({ error: String(err,), },);
  }
}
