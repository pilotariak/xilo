/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

const SLACK_API_BASE = 'https://slack.com/api';

/**
 * Posts a message to a Slack channel using the Bot token.
 *
 * @param threadTs - When set, the message is posted as a reply in that thread.
 */
export async function postMessage(
  botToken: string,
  channel: string,
  text: string,
  blocks?: object[],
  threadTs?: string,
): Promise<void> {
  const body: Record<string, unknown> = { channel, text, };
  if (blocks) {
    body.blocks = blocks;
  }
  if (threadTs) {
    body.thread_ts = threadTs;
  }

  const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body,),
  },);

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status} ${response.statusText}`,);
  }

  const data = (await response.json()) as { ok: boolean; error?: string; };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`,);
  }
}

/**
 * Sends a delayed response to a Slack response_url.
 * Useful for long-running operations where the initial 3-second deadline has passed.
 */
export async function sendDelayedResponse(
  responseUrl: string,
  text: string,
  responseType: 'in_channel' | 'ephemeral' = 'ephemeral',
  blocks?: object[],
): Promise<void> {
  const body: Record<string, unknown> = { text, response_type: responseType, };
  if (blocks) {
    body.blocks = blocks;
  }

  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', },
    body: JSON.stringify(body,),
  },);
}

/**
 * Replaces an interactive ephemeral message via response_url.
 * Used in Block Kit interactive flows to update the original message in place.
 * Throws if Slack returns a non-ok response or an error payload.
 */
export async function updateInteractiveMessage(
  responseUrl: string,
  text: string,
  blocks?: object[],
): Promise<void> {
  const body: Record<string, unknown> = {
    replace_original: true,
    response_type: 'ephemeral',
    text,
  };
  if (blocks) {
    body.blocks = blocks;
  }

  const res = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', },
    body: JSON.stringify(body,),
  },);

  if (!res.ok) {
    let errText = '(unreadable)';
    try {
      errText = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`response_url update failed: HTTP ${res.status} — ${errText}`,);
  }
}
