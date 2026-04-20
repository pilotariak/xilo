/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { Logger, } from '../../logger.js';
import type {
  AgentMessage,
  AgentProvider,
  ProviderResponse,
  ToolCall,
  ToolDefinition,
} from '../types.js';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

// --- Wire types (Anthropic API) ---

type ClaudeContentBlock =
  | { type: 'text'; text: string; }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; }
  | { type: 'tool_result'; tool_use_id: string; content: string; };

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

// --- Message adapter ---

function toClaudeMessages(messages: AgentMessage[],): ClaudeMessage[] {
  const result: ClaudeMessage[] = [];
  for (const msg of messages) {
    switch (msg.role) {
      case 'user':
        result.push({ role: 'user', content: msg.content, },);
        break;
      case 'assistant':
        result.push({ role: 'assistant', content: msg.content, },);
        break;
      case 'assistant_tool_calls':
        result.push({
          role: 'assistant',
          content: msg.toolCalls.map((tc,) => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          })),
        },);
        break;
      case 'tool_results': {
        // Claude expects all tool results in a single user message.
        // Append the wrap-up hint as a text block when present.
        const toolResultBlocks: ClaudeContentBlock[] = msg.results.map((r,) => ({
          type: 'tool_result' as const,
          tool_use_id: r.toolCallId,
          content: r.content,
        }));
        if (msg.wrapUpHint) {
          toolResultBlocks.push({ type: 'text', text: msg.wrapUpHint, },);
        }
        result.push({ role: 'user', content: toolResultBlocks, },);
        break;
      }
    }
  }
  return result;
}

// --- Provider factory ---

export function createClaudeProvider(apiKey: string, log: Logger,): AgentProvider {
  const providerLog = log.child({ provider: 'claude', model: DEFAULT_MODEL, },);
  return {
    async complete(
      systemPrompt: string,
      messages: AgentMessage[],
      tools: ToolDefinition[],
    ): Promise<ProviderResponse> {
      providerLog.debug(
        { messageCount: messages.length, toolCount: tools.length, },
        'calling Claude API',
      );

      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: toClaudeMessages(messages,),
          tools: tools.map((t,) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
          })),
        },),
      },);

      if (!response.ok) {
        const text = await response.text();
        providerLog.error({ status: response.status, body: text, }, 'Claude API error',);
        throw new Error(`Claude API error ${response.status}: ${text}`,);
      }

      const data = (await response.json()) as {
        stop_reason: string;
        content: Array<
          | { type: 'text'; text: string; }
          | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; }
        >;
      };

      const toolCalls: ToolCall[] = data.content
        .filter((b,) => b.type === 'tool_use')
        .map((b,) => {
          const tc = b as {
            type: 'tool_use';
            id: string;
            name: string;
            input: Record<string, unknown>;
          };
          return { id: tc.id, name: tc.name, arguments: tc.input, };
        },);

      const textBlock = data.content.find((b,) => b.type === 'text') as
        | { type: 'text'; text: string; }
        | undefined;

      providerLog.debug(
        { stopReason: data.stop_reason, toolCallCount: toolCalls.length, hasText: !!textBlock, },
        'Claude API response',
      );

      if (toolCalls.length > 0) {
        return { type: 'tool_calls', calls: toolCalls, partialText: textBlock?.text, };
      }

      return { type: 'text', content: textBlock?.text ?? '', };
    },
  };
}
