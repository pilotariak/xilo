/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import pino from 'pino';

import type { Env, } from './types.js';

export type Logger = pino.Logger;

/**
 * Creates a pino logger suitable for Cloudflare Workers.
 *
 * Cloudflare Workers exposes `console.log` / `.warn` / `.error` to its log
 * stream. We route pino's JSON output through those methods so log entries
 * are visible in `wrangler tail` and the Workers dashboard.
 *
 * Log level is read from `env.LOG_LEVEL` (default: `'info'`).
 * Set `LOG_LEVEL=debug` in wrangler.jsonc (or as a secret) to see all
 * debug-level entries including LLM API calls and tool dispatches.
 */
export function createLogger(
  env: Pick<Env, 'LOG_LEVEL'>,
  bindings?: Record<string, unknown>,
): Logger {
  const level = env.LOG_LEVEL ?? 'info';
  return pino(
    {
      level,
      base: { service: 'xilo', ...bindings, },
      formatters: {
        // Emit level as a human-readable string instead of a number.
        level: (label,) => ({ level: label, }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    // Custom destination: write each JSON log line through console.log.
    // Workers captures all console output; the JSON format works with any
    // log aggregator (Grafana Loki, Datadog, etc.).
    {
      write(msg: string,): void {
        console.log(msg.trimEnd(),);
      },
    },
  );
}
