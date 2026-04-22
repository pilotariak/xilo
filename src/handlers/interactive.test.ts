/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi, } from 'vitest';
import type { AgentJob, Env, } from '../types.js';
import { handleInteractive, } from './interactive.js';

const env: Env = {
  SLACK_SIGNING_SECRET: 'secret',
  SLACK_BOT_TOKEN: 'xoxb-test',
  FRONTIS_URL: 'http://localhost:4000/graphql',
  AGENT_QUEUE: { send: vi.fn(), } as unknown as Queue<AgentJob>,
  AI: {} as Ai,
};

function makeCtx(): { ctx: ExecutionContext; waitForAsync: () => Promise<void>; } {
  let pending: Promise<unknown> | undefined;
  const ctx = {
    waitUntil: (p: Promise<unknown>,) => {
      pending = p;
    },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
  return {
    ctx,
    waitForAsync: async () => {
      if (pending) { await pending; }
    },
  };
}

/** Encodes a Slack block_actions payload as the URL-encoded form body Slack sends. */
function interactiveBody(overrides: Partial<{
  type: string;
  actionId: string;
  blockId: string;
  value: string | undefined;
  responseUrl: string;
}> = {},): string {
  const isButton = overrides.value === undefined;
  const action: Record<string, unknown> = {
    type: isButton ? 'button' : 'static_select',
    action_id: overrides.actionId ?? 'competition',
    block_id: overrides.blockId ?? 'r:lcapb',
  };
  if (!isButton) {
    action.selected_option = {
      value: overrides.value,
      text: { type: 'plain_text', text: 'Championnat LCAPB', },
    };
  }
  const payload = {
    type: overrides.type ?? 'block_actions',
    user: { id: 'U1', name: 'alice', },
    channel: { id: 'C1', },
    response_url: overrides.responseUrl ?? 'https://hooks.slack.com/actions/T1/respond',
    actions: [action,],
  };
  return `payload=${encodeURIComponent(JSON.stringify(payload,),)}`;
}

function mockGraphQL(data: unknown,): ReturnType<typeof vi.fn> {
  const mock = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data, },),
    },)
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({},), },);
  vi.stubGlobal('fetch', mock,);
  return mock;
}

/** Extracts the JSON body sent to the response_url (always the last fetch call). */
async function capturePostedBody(
  mock: ReturnType<typeof vi.fn>,
): Promise<Record<string, unknown>> {
  const lastCall = mock.mock.calls.at(-1,) as [string, { body: string; },];
  return JSON.parse(lastCall[1].body,) as Record<string, unknown>;
}

beforeEach(() => {
  vi.unstubAllGlobals();
},);

afterEach(() => {
  vi.unstubAllGlobals();
},);

describe('handleInteractive', () => {
  it('returns 400 when payload field is missing', async () => {
    const { ctx, } = makeCtx();
    const res = await handleInteractive('not_a_payload=true', env, ctx,);
    expect(res.status,).toBe(400,);
  });

  it('returns 400 when payload is not valid JSON', async () => {
    const { ctx, } = makeCtx();
    const res = await handleInteractive('payload=not-json', env, ctx,);
    expect(res.status,).toBe(400,);
  });

  it('returns 200 for unknown type without crashing', async () => {
    const { ctx, } = makeCtx();
    const res = await handleInteractive(
      interactiveBody({ type: 'shortcut', },),
      env,
      ctx,
    );
    expect(res.status,).toBe(200,);
  });

  describe('action_id: competition → specialty select', () => {
    it('fetches specialties and posts specialty select via response_url', async () => {
      const mock = mockGraphQL({
        specialties: [
          { id: '1', name: 'Place Libre', },
          { id: '2', name: 'Trinquet', },
        ],
      },);

      const { ctx, waitForAsync, } = makeCtx();
      const res = await handleInteractive(
        interactiveBody({ actionId: 'competition', blockId: 'r:lcapb', value: '5', },),
        env,
        ctx,
      );
      expect(res.status,).toBe(200,);

      await waitForAsync();

      expect(mock,).toHaveBeenCalledTimes(2,);
      const posted = await capturePostedBody(mock,);
      expect(posted.replace_original,).toBe(true,);
      const blocksJson = JSON.stringify(posted.blocks,);
      expect(blocksJson,).toContain('Place Libre',);
      expect(blocksJson,).toContain('Trinquet',);
      // block_id must encode league + competitionId
      expect(blocksJson,).toContain('r:lcapb:5',);
      expect(blocksJson,).toContain('specialty',);
    });
  });

  describe('action_id: specialty → category select', () => {
    it('fetches categories and posts category select via response_url', async () => {
      const mock = mockGraphQL({
        categories: [
          { id: '10', name: '1ère Série', },
          { id: '11', name: 'Seniors', },
        ],
      },);

      const { ctx, waitForAsync, } = makeCtx();
      const res = await handleInteractive(
        interactiveBody({ actionId: 'specialty', blockId: 'r:lcapb:5', value: '2', },),
        env,
        ctx,
      );
      expect(res.status,).toBe(200,);

      await waitForAsync();

      expect(mock,).toHaveBeenCalledTimes(2,);
      const posted = await capturePostedBody(mock,);
      expect(posted.replace_original,).toBe(true,);
      const blocksJson = JSON.stringify(posted.blocks,);
      expect(blocksJson,).toContain('1ère Série',);
      expect(blocksJson,).toContain('Seniors',);
      // block_id must encode league + competitionId + specialtyId
      expect(blocksJson,).toContain('r:lcapb:5:2',);
      expect(blocksJson,).toContain('category',);
    });
  });

  describe('action_id: category → confirm button', () => {
    it('posts confirm block (no GraphQL fetch) via response_url', async () => {
      const mock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({},), },);
      vi.stubGlobal('fetch', mock,);

      const { ctx, waitForAsync, } = makeCtx();
      const res = await handleInteractive(
        interactiveBody({ actionId: 'category', blockId: 'r:lcapb:5:2', value: '10', },),
        env,
        ctx,
      );
      expect(res.status,).toBe(200,);

      await waitForAsync();

      // No GraphQL call — only the response_url update
      expect(mock,).toHaveBeenCalledTimes(1,);
      const posted = await capturePostedBody(mock,);
      expect(posted.replace_original,).toBe(true,);
      const blocksJson = JSON.stringify(posted.blocks,);
      // Confirm block must carry all 4 IDs in block_id
      expect(blocksJson,).toContain('r:lcapb:5:2:10',);
      expect(blocksJson,).toContain('confirm',);
      expect(blocksJson,).toContain('Fetch results',);
    });
  });

  describe('action_id: confirm → results', () => {
    it('fetches results using all IDs from block_id and posts them', async () => {
      const mock = mockGraphQL({
        results: [
          {
            id: '99',
            dateMatch: '2025-10-01',
            phase: 'Finale',
            scores: '15/10',
            clubA: { id: '1', name: 'Denek Bat', },
            clubB: { id: '2', name: 'Noizbait', },
            specialty: { id: '2', name: 'Trinquet', },
            category: { id: '10', name: '1ère Série', },
          },
        ],
      },);

      const { ctx, waitForAsync, } = makeCtx();
      const res = await handleInteractive(
        // button: no selected_option, state fully in block_id
        interactiveBody({ actionId: 'confirm', blockId: 'r:lcapb:5:2:10', value: undefined, },),
        env,
        ctx,
      );
      expect(res.status,).toBe(200,);

      await waitForAsync();

      expect(mock,).toHaveBeenCalledTimes(2,);
      const posted = await capturePostedBody(mock,);
      expect(posted.replace_original,).toBe(true,);
      const blocksJson = JSON.stringify(posted.blocks,);
      // Winner (clubA, score 15 > 10) is bolded; loser is plain
      expect(blocksJson,).toContain('*Denek Bat*',);
      expect(blocksJson,).toContain('Noizbait',);
      expect(blocksJson,).toContain('Finale',);
      // Score: winner portion bold, loser plain
      expect(blocksJson,).toContain('*15*/10',);
    });
  });

  describe('error handling', () => {
    it('posts error block via response_url when GraphQL fails', async () => {
      const mock = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error', },)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({},), },);
      vi.stubGlobal('fetch', mock,);

      const { ctx, waitForAsync, } = makeCtx();
      await handleInteractive(
        interactiveBody({ actionId: 'competition', blockId: 'r:lcapb', value: '5', },),
        env,
        ctx,
      );
      await waitForAsync();

      const posted = await capturePostedBody(mock,);
      expect(posted.replace_original,).toBe(true,);
      const blocksJson = JSON.stringify(posted.blocks,);
      expect(blocksJson,).toContain('500',);
    });

    it('silently ignores unknown action_id', async () => {
      // No fetch should be called for unknown action
      const mock = vi.fn();
      vi.stubGlobal('fetch', mock,);

      const { ctx, waitForAsync, } = makeCtx();
      const res = await handleInteractive(
        interactiveBody({ actionId: 'unknown_action', blockId: 'r:lcapb', value: '5', },),
        env,
        ctx,
      );
      expect(res.status,).toBe(200,);
      await waitForAsync();
      expect(mock,).not.toHaveBeenCalled();
    });

    it('silently ignores block_id with wrong prefix', async () => {
      const mock = vi.fn();
      vi.stubGlobal('fetch', mock,);

      const { ctx, waitForAsync, } = makeCtx();
      await handleInteractive(
        interactiveBody({ actionId: 'competition', blockId: 'wrong:lcapb', value: '5', },),
        env,
        ctx,
      );
      await waitForAsync();
      expect(mock,).not.toHaveBeenCalled();
    });
  });
});
