/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { Logger, } from '../../logger.js';
import type { Env, } from '../../types.js';
import type { AgentProvider, } from '../types.js';
import { createClaudeProvider, } from './claude.js';
import { createGeminiProvider, } from './gemini.js';
import { createMistralProvider, } from './mistral.js';

/**
 * Instantiates the agent provider configured by AGENT_PROVIDER.
 * The logger is passed to the provider factory so API calls are traced.
 * Throws if the required API key is missing.
 */
export function createProvider(env: Env, log: Logger,): AgentProvider {
  const provider = (env.AGENT_PROVIDER ?? 'gemini').toLowerCase();
  switch (provider) {
    case 'claude': {
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not set',);
      }
      return createClaudeProvider(env.ANTHROPIC_API_KEY, log,);
    }
    case 'gemini': {
      if (!env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set',);
      }
      return createGeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL, log,);
    }
    case 'mistral': {
      if (!env.MISTRAL_API_KEY) {
        throw new Error('MISTRAL_API_KEY is not set',);
      }
      return createMistralProvider(env.MISTRAL_API_KEY, log,);
    }
    default:
      throw new Error(
        `Unknown AGENT_PROVIDER: "${provider}". Valid values: claude, gemini, mistral`,
      );
  }
}
