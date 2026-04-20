/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { createProvider, } from '../agent/providers/index.js';
import { runAgent, } from '../agent/runner.js';
import { createLogger, } from '../logger.js';
import { postMessage, sendDelayedResponse, } from '../slack/api.js';
import type { AgentJob, Env, } from '../types.js';

/**
 * Maximum wall-clock time for a single agent run inside the queue consumer.
 * Cloudflare Queue consumers may run up to 15 minutes; we stay well within that.
 */
const AGENT_TIMEOUT_MS = 780_000; // 13 minutes

/**
 * Processes a batch of agent jobs from AGENT_QUEUE.
 */
export async function handleQueue(batch: MessageBatch<AgentJob>, env: Env,): Promise<void> {
  for (const message of batch.messages) {
    await processJob(message.body, env,);
    message.ack();
  }
}

async function processJob(job: AgentJob, env: Env,): Promise<void> {
  const log = createLogger(env, {
    module: 'queue',
    channel: job.channel,
    league: job.league,
  },);

  log.info({
    question: job.question.slice(0, 120,),
    hasAiBinding: !!env.AI,
  }, 'queue job started',);

  let provider;
  try {
    provider = createProvider(env, log,);
  } catch (err) {
    log.error({ err: String(err,), }, 'provider creation failed in queue consumer',);
    await reply(job, env, `Agent not configured: ${String(err,)}`,).catch(() => {},);
    return;
  }

  const agentQuestion = `League: ${job.league}\n\nQuestion: ${job.question}`;
  const debugCallback = job.debugMode
    ? async (msg: string,) => {
      await postMessage(env.SLACK_BOT_TOKEN, job.channel, msg, undefined, job.threadTs,).catch(
        () => {},
      );
    }
    : undefined;

  try {
    const answer = await Promise.race([
      runAgent(agentQuestion, env.FRONTIS_URL, provider, debugCallback, log,),
      new Promise<never>((_, reject,) =>
        setTimeout(
          () =>
            reject(
              new Error(
                'Agent timed out. Try a more specific question or use the slash commands (/competitions, /results, …).',
              ),
            ),
          AGENT_TIMEOUT_MS,
        )
      ),
    ],);
    log.info({ answerLength: answer.length, }, 'queue job completed',);
    await reply(job, env, answer,);
  } catch (err) {
    log.error({ err: String(err,), }, 'agent error in queue consumer',);
    await reply(job, env, `Agent error: ${String(err,)}`,).catch(() => {},);
  }
}

async function reply(job: AgentJob, env: Env, text: string,): Promise<void> {
  if (job.responseUrl) {
    await sendDelayedResponse(job.responseUrl, text, 'ephemeral',);
  } else {
    await postMessage(env.SLACK_BOT_TOKEN, job.channel, text, undefined, job.threadTs,);
  }
}
