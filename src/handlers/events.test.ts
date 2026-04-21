/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi, } from 'vitest';
import type { AgentJob, Env, SlackEventPayload, } from '../types.js';
import { handleEvent, } from './events.js';

const env: Env = {
  SLACK_SIGNING_SECRET: 'secret',
  SLACK_BOT_TOKEN: 'xoxb-test',
  FRONTIS_URL: 'http://localhost:4000/graphql',
  AGENT_QUEUE: {
    send: vi.fn(),
  } as unknown as Queue<AgentJob>,
  AI: {} as Ai,
};

const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

function makeRequest(headers: Record<string, string> = {},): Request {
  return new Request('https://example.com/slack/events', {
    method: 'POST',
    headers,
  },);
}

describe('handleEvent — url_verification', () => {
  it('echoes the challenge', async () => {
    const payload: SlackEventPayload = {
      token: 'tok',
      team_id: 'T1',
      api_app_id: 'A1',
      type: 'url_verification',
      challenge: 'my-challenge-value',
    };

    const res = await handleEvent(makeRequest(), payload, env, ctx,);
    expect(res.status,).toBe(200,);
    const body = await res.json<{ challenge: string; }>();
    expect(body.challenge,).toBe('my-challenge-value',);
  });
});

describe('handleEvent — retry deduplication', () => {
  it('returns 200 without processing on x-slack-retry-num header', async () => {
    const payload: SlackEventPayload = {
      token: 'tok',
      team_id: 'T1',
      api_app_id: 'A1',
      type: 'event_callback',
      event_id: 'Ev001',
      event: { type: 'app_mention', channel: 'C1', text: 'hello', user: 'U1', },
    };

    const waitUntilSpy = vi.spyOn(ctx, 'waitUntil',);
    const req = makeRequest({ 'x-slack-retry-num': '1', 'x-slack-retry-reason': 'http_timeout', },);
    const res = await handleEvent(req, payload, env, ctx,);

    expect(res.status,).toBe(200,);
    expect(waitUntilSpy,).not.toHaveBeenCalled();
  });
});

describe('handleEvent — app_rate_limited', () => {
  it('returns 200 without processing', async () => {
    const payload: SlackEventPayload = {
      token: 'tok',
      team_id: 'T1',
      api_app_id: 'A1',
      type: 'app_rate_limited',
      minute_rate_limited: 1518467820,
    };

    const waitUntilSpy = vi.spyOn(ctx, 'waitUntil',);
    const res = await handleEvent(makeRequest(), payload, env, ctx,);

    expect(res.status,).toBe(200,);
    expect(waitUntilSpy,).not.toHaveBeenCalled();
  });
});

describe('handleEvent — event_callback', () => {
  it('acks immediately and delegates processing via waitUntil', async () => {
    const payload: SlackEventPayload = {
      token: 'tok',
      team_id: 'T1',
      api_app_id: 'A1',
      type: 'event_callback',
      event_id: 'Ev002',
      event: { type: 'message', channel: 'C1', text: 'hi', user: 'U1', },
    };

    const waitUntilSpy = vi.spyOn(ctx, 'waitUntil',);
    const res = await handleEvent(makeRequest(), payload, env, ctx,);

    expect(res.status,).toBe(200,);
    expect(waitUntilSpy,).toHaveBeenCalledOnce();
  });
});
