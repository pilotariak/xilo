/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { Logger, } from '../../logger.js';
import type { Env, } from '../../types.js';
import type { AgentProvider, } from '../types.js';
import { createWorkersAIProvider, } from './workers-ai.js';

/**
 * Instantiates the agent provider configured by AGENT_PROVIDER.
 * Defaults to 'workers-ai' using Cloudflare Workers AI.
 */
export function createProvider(env: Env, log: Logger,): AgentProvider {
  const provider = (env.AGENT_PROVIDER ?? 'workers-ai').toLowerCase();
  switch (provider) {
    case 'workers-ai':
      if (!env.AI) {
        throw new Error(
          'AI binding is not configured. Check your wrangler.jsonc and ensure the "ai" binding is present.',
        );
      }
      return createWorkersAIProvider(env.AI, env.WORKERS_AI_MODEL, log,);
    default:
      throw new Error(
        `Unknown AGENT_PROVIDER: "${provider}". Valid values: workers-ai`,
      );
  }
}
