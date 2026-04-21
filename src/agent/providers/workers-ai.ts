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

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

// --- Wire types (Workers AI) ---

interface WorkersAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

// --- Message adapter ---

function toWorkersAIMessages(messages: AgentMessage[],): WorkersAIMessage[] {
  const result: WorkersAIMessage[] = [];
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
          content: '',
          tool_calls: msg.toolCalls.map((tc,) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments,),
            },
          })),
        },);
        break;
      case 'tool_results': {
        for (const res of msg.results) {
          result.push({
            role: 'tool',
            tool_call_id: res.toolCallId,
            content: res.content,
          },);
        }
        if (msg.wrapUpHint) {
          result.push({ role: 'user', content: msg.wrapUpHint, },);
        }
        break;
      }
    }
  }
  return result;
}

// --- Provider factory ---

export function createWorkersAIProvider(
  ai: any,
  model: string | undefined,
  log: Logger,
): AgentProvider {
  const activeModel = model || DEFAULT_MODEL;
  const providerLog = log.child({ provider: 'workers-ai', model: activeModel, },);

  return {
    async complete(
      systemPrompt: string,
      messages: AgentMessage[],
      tools: ToolDefinition[],
    ): Promise<ProviderResponse> {
      providerLog.debug(
        { messageCount: messages.length, toolCount: tools.length, },
        'calling Workers AI',
      );

      const allMessages: WorkersAIMessage[] = [
        { role: 'system', content: systemPrompt, },
        ...toWorkersAIMessages(messages,),
      ];

      const response = await ai.run(activeModel, {
        messages: allMessages,
        tools: tools.map((t,) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      },);

      // Workers AI .run() returns the data directly if successful.
      providerLog.debug({ rawToolCalls: response.tool_calls, }, 'raw tool calls from model',);
      const toolCalls: ToolCall[] = (response.tool_calls || [])
        .filter((tc: any,) => tc?.function?.name)
        .map((tc: any,) => ({
          id: tc.id ?? crypto.randomUUID(),
          name: tc.function.name,
          arguments: typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments,)
            : (tc.function.arguments ?? {}),
        }));

      providerLog.debug(
        { toolCallCount: toolCalls.length, hasText: !!response.response, },
        'Workers AI response',
      );

      if (toolCalls.length > 0) {
        return { type: 'tool_calls', calls: toolCalls, partialText: response.response, };
      }

      return { type: 'text', content: response.response || '', };
    },
  };
}
