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
  ToolParameterSchema,
} from '../types.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
/** Default model — override with GEMINI_MODEL env var.
 *  Free options: 'gemini-2.0-flash', 'gemma-4-26b-a4b-it' (same API key, same endpoint). */
const DEFAULT_MODEL = 'gemini-2.0-flash';

// --- Wire types (Google AI API) ---

type GeminiPart =
  | { text: string; }
  | { functionCall: { name: string; args: Record<string, unknown>; }; }
  | { functionResponse: { name: string; response: Record<string, unknown>; }; };

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// --- Schema adapter ---
// Gemini requires uppercase type names ("STRING" not "string", "OBJECT" not "object").

function toGeminiSchema(schema: ToolParameterSchema,): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [key, val,] of Object.entries(schema.properties,)) {
    const converted: Record<string, unknown> = {
      type: val.type.toUpperCase(),
      description: val.description,
    };
    if (val.enum) {
      converted['enum'] = val.enum;
    }
    properties[key] = converted;
  }
  return {
    type: 'OBJECT',
    properties,
    ...(schema.required ? { required: schema.required, } : {}),
  };
}

// --- Message adapter ---

function toGeminiContents(messages: AgentMessage[],): GeminiContent[] {
  const result: GeminiContent[] = [];
  for (const msg of messages) {
    switch (msg.role) {
      case 'user':
        result.push({ role: 'user', parts: [{ text: msg.content, },], },);
        break;
      case 'assistant':
        result.push({ role: 'model', parts: [{ text: msg.content, },], },);
        break;
      case 'assistant_tool_calls':
        result.push({
          role: 'model',
          parts: msg.toolCalls.map((tc,) => ({
            functionCall: { name: tc.name, args: tc.arguments, },
          })),
        },);
        break;
      case 'tool_results': {
        // Gemini's functionResponse.response must be a JSON object (Proto Struct).
        // Tool results are often JSON arrays — wrap them in { result: [...] }.
        const fnResponseParts: GeminiPart[] = msg.results.map((r,) => {
          let parsed: Record<string, unknown>;
          try {
            const raw: unknown = JSON.parse(r.content,);
            parsed = Array.isArray(raw,) ? { result: raw, } : (raw as Record<string, unknown>);
          } catch {
            parsed = { result: r.content, };
          }
          return { functionResponse: { name: r.toolName, response: parsed, }, };
        },);
        // Append wrap-up hint as a text part when present.
        if (msg.wrapUpHint) {
          fnResponseParts.push({ text: msg.wrapUpHint, },);
        }
        result.push({ role: 'user', parts: fnResponseParts, },);
        break;
      }
    }
  }
  return result;
}

// --- Provider factory ---

const noop = (): void => {};
const noopLog = { debug: noop, error: noop, } as unknown as Logger;

export function createGeminiProvider(apiKey: string, model?: string, log?: Logger,): AgentProvider {
  const resolvedModel = model ?? DEFAULT_MODEL;
  const providerLog = log
    ? log.child({ provider: 'gemini', model: resolvedModel, },)
    : noopLog;
  return {
    async complete(
      systemPrompt: string,
      messages: AgentMessage[],
      tools: ToolDefinition[],
    ): Promise<ProviderResponse> {
      providerLog.debug(
        { messageCount: messages.length, toolCount: tools.length, },
        'calling Gemini API',
      );

      const url = `${GEMINI_API_BASE}/${resolvedModel}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt, },], },
          contents: toGeminiContents(messages,),
          tools: [
            {
              functionDeclarations: tools.map((t,) => ({
                name: t.name,
                description: t.description,
                parameters: toGeminiSchema(t.parameters,),
              })),
            },
          ],
        },),
      },);

      if (!response.ok) {
        const text = await response.text();
        providerLog.error({ status: response.status, body: text, }, 'Gemini API error',);
        throw new Error(`Gemini API error ${response.status}: ${text}`,);
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content: { parts: GeminiPart[]; }; finishReason?: string; }>;
        error?: { message: string; };
      };

      if (data.error) {
        providerLog.error({ geminiError: data.error.message, }, 'Gemini error',);
        throw new Error(`Gemini error: ${data.error.message}`,);
      }

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const finishReason = data.candidates?.[0]?.finishReason;

      // Collect function calls — Gemini has no call IDs, so we generate synthetic ones.
      const toolCalls: ToolCall[] = [];
      let callIndex = 0;
      for (const part of parts) {
        if ('functionCall' in part) {
          toolCalls.push({
            id: `gemini-call-${callIndex++}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args,
          },);
        }
      }

      const textContent = parts
        .filter((p,): p is { text: string; } => 'text' in p)
        .map((p,) => p.text)
        .join('',);

      providerLog.debug(
        { finishReason, toolCallCount: toolCalls.length, hasText: !!textContent, },
        'Gemini API response',
      );

      if (toolCalls.length > 0) {
        return { type: 'tool_calls', calls: toolCalls, partialText: textContent || undefined, };
      }

      return { type: 'text', content: textContent, };
    },
  };
}
