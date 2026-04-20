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

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const DEFAULT_MODEL = 'mistral-small-latest';

// --- Wire types (Mistral / OpenAI-compatible) ---

interface MistralMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string; };
  }>;
  tool_call_id?: string;
  name?: string;
}

// --- Message adapter ---

function toMistralMessages(systemPrompt: string, messages: AgentMessage[],): MistralMessage[] {
  const result: MistralMessage[] = [{ role: 'system', content: systemPrompt, },];
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
          content: null,
          tool_calls: msg.toolCalls.map((tc,) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments,), },
          })),
        },);
        break;
      case 'tool_results':
        // Mistral (OpenAI-compatible) expects one `tool` message per result.
        for (const r of msg.results) {
          result.push({
            role: 'tool',
            tool_call_id: r.toolCallId,
            name: r.toolName,
            content: r.content,
          },);
        }
        // Append wrap-up hint as a user message after all tool results.
        if (msg.wrapUpHint) {
          result.push({ role: 'user', content: msg.wrapUpHint, },);
        }
        break;
    }
  }
  return result;
}

// --- Provider factory ---

const noop = (): void => {};
const noopLog = { debug: noop, error: noop, } as unknown as Logger;

export function createMistralProvider(apiKey: string, log?: Logger,): AgentProvider {
  const providerLog = log
    ? log.child({ provider: 'mistral', model: DEFAULT_MODEL, },)
    : noopLog;
  return {
    async complete(
      systemPrompt: string,
      messages: AgentMessage[],
      tools: ToolDefinition[],
    ): Promise<ProviderResponse> {
      providerLog.debug(
        { messageCount: messages.length, toolCount: tools.length, },
        'calling Mistral API',
      );

      const response = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: toMistralMessages(systemPrompt, messages,),
          tools: tools.map((t,) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
          tool_choice: 'auto',
        },),
      },);

      if (!response.ok) {
        const text = await response.text();
        providerLog.error({ status: response.status, body: text, }, 'Mistral API error',);
        throw new Error(`Mistral API error ${response.status}: ${text}`,);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string; };
            }>;
          };
          finish_reason: string;
        }>;
        error?: { message: string; };
      };

      if (data.error) {
        providerLog.error({ mistralError: data.error.message, }, 'Mistral error',);
        throw new Error(`Mistral error: ${data.error.message}`,);
      }

      const choice = data.choices?.[0];
      const message = choice?.message;
      if (!message) {
        throw new Error('Mistral returned no message',);
      }

      providerLog.debug(
        {
          finishReason: choice?.finish_reason,
          toolCallCount: message.tool_calls?.length ?? 0,
          hasText: !!message.content,
        },
        'Mistral API response',
      );

      if (message.tool_calls?.length) {
        const toolCalls: ToolCall[] = message.tool_calls.map((tc,) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments,) as Record<string, unknown>,
        }));
        return { type: 'tool_calls', calls: toolCalls, partialText: message.content ?? undefined, };
      }

      return { type: 'text', content: message.content ?? '', };
    },
  };
}
