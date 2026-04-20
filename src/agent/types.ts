/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/** JSON Schema subset used for tool parameter definitions. */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string; enum?: string[]; }>;
  required?: string[];
}

/** A tool the LLM can invoke. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

/** A single tool invocation requested by the LLM. */
export interface ToolCall {
  /** Provider-supplied call ID (used to match results back). */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Internal conversation message format.
 * Each variant maps to the provider's wire format inside its adapter.
 */
export type AgentMessage =
  | { role: 'user'; content: string; }
  | { role: 'assistant'; content: string; }
  | { role: 'assistant_tool_calls'; toolCalls: ToolCall[]; }
  | {
    role: 'tool_results';
    results: Array<{ toolCallId: string; toolName: string; content: string; }>;
    /** Optional wrap-up pressure injected as a user text block alongside tool results. */
    wrapUpHint?: string;
  };

/** What the provider returns after one completion call. */
export type ProviderResponse =
  | { type: 'text'; content: string; }
  | {
    type: 'tool_calls';
    calls: ToolCall[];
    /** Any text the LLM produced alongside its tool calls (used as fallback). */
    partialText?: string;
  };

/** Minimal interface every provider must implement. */
export interface AgentProvider {
  complete(
    systemPrompt: string,
    messages: AgentMessage[],
    tools: ToolDefinition[],
  ): Promise<ProviderResponse>;
}
