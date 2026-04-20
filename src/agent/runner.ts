/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

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
You have access to tools that query the Frontis sports database.

To answer questions about results:
1. Use list_competitions, list_specialties, and list_categories to resolve names to IDs.
2. Call list_results with the resolved IDs as filters.
3. Present the results clearly.

Always answer in the same language as the user's question (French, Basque, Spanish, or English).
Be concise and well-formatted in your answer.`;

/**
 * Runs the agent loop for a natural-language sports query.
 *
 * Improvements over the naive loop:
 * - Tool calls within a single turn are dispatched in parallel.
 * - Identical tool calls are deduplicated via an in-request cache.
 * - A wrap-up warning is injected when iterations are running low.
 * - The last text the LLM produced is preserved as a fallback answer.
 *
 * @param question       The user's question (prefixed with the league context).
 * @param gatewayUrl     Frontis GraphQL gateway URL.
 * @param provider       The LLM provider to use.
 * @param debugCallback  When set, called after each tool call with a formatted
 *                       debug block showing the GraphQL query and response.
 * @param log            Pino logger; a no-op logger is used when omitted.
 * @returns A formatted answer string.
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
    : { debug: () => {}, info: () => {}, warn: () => {}, } as unknown as Logger;

  runLog.info({ question: question.slice(0, 120,), }, 'agent started',);

  const messages: AgentMessage[] = [{ role: 'user', content: question, },];

  // Deduplication: avoid repeating the same Frontis query in one session.
  const toolCache = new Map<string, string>();

  // Preserve the last text the LLM produced so we can return it as a
  // partial answer if the loop exhausts without a clean end_turn.
  let lastText: string | undefined;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    runLog.debug({ iteration: i + 1, }, 'agent iteration',);

    const response = await provider.complete(SYSTEM_PROMPT, messages, TOOL_DEFINITIONS,);

    if (response.type === 'text') {
      runLog.info({ iteration: i + 1, answerLength: response.content.length, }, 'agent completed',);
      return response.content || 'No answer found.';
    }

    // Capture any text the provider returned alongside tool calls.
    if (response.partialText) {
      lastText = response.partialText;
    }

    runLog.info(
      { iteration: i + 1, toolCalls: response.calls.map((c,) => c.name), },
      'tool calls requested',
    );

    // Append the assistant's tool-call turn to the history.
    messages.push({ role: 'assistant_tool_calls', toolCalls: response.calls, },);

    // Dispatch all tool calls in parallel, deduplicating identical ones.
    const results = await Promise.all(
      response.calls.map(async (call,) => {
        const cacheKey = `${call.name}:${JSON.stringify(call.arguments,)}`;
        let content = toolCache.get(cacheKey,);
        if (content === undefined) {
          runLog.debug({ tool: call.name, args: call.arguments, }, 'executing tool',);
          content = await executeTool(call, gatewayUrl,);
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

    // Warn the LLM to wrap up when it's running low on iterations.
    const remaining = MAX_ITERATIONS - (i + 1);
    const wrapUpHint = remaining <= WARN_AT_REMAINING
      ? `⚠️ You have ${remaining} iteration(s) left. Stop calling tools and write your final answer now using the information already gathered.`
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

/**
 * Formats a tool call + its result as a Slack-friendly debug block.
 * `league` is shown separately (it becomes the X-Pilotariak-League header,
 * not a GraphQL variable).
 */
function formatDebug(call: ToolCall, result: string,): string {
  const query = GRAPHQL_QUERIES[call.name];
  const { league, ...gqlVariables } = call.arguments;

  const truncated = result.length > MAX_DEBUG_RESPONSE_CHARS
    ? result.slice(0, MAX_DEBUG_RESPONSE_CHARS,) + '\n… *(truncated)*'
    : result;

  const parts: string[] = [`🔍 *\`${call.name}\`* — league: \`${String(league ?? '?',)}\``,];

  if (query) {
    parts.push(`*GraphQL request:*\n\`\`\`\n${query.trim()}\n\`\`\``,);
  }

  if (Object.keys(gqlVariables,).length > 0) {
    parts.push(`*Variables:*\n\`\`\`json\n${JSON.stringify(gqlVariables, null, 2,)}\n\`\`\``,);
  }

  parts.push(`*Response:*\n\`\`\`json\n${truncated}\n\`\`\``,);

  return parts.join('\n',);
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function executeTool(call: ToolCall, gatewayUrl: string,): Promise<string> {
  const args = call.arguments;
  const league = String(args['league'] ?? '',);

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
    return JSON.stringify({ error: String(err,), },);
  }
}
