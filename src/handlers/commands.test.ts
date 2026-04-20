/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi, } from 'vitest';
import pkg from '../../package.json';
import type { Env, SlashCommandPayload, } from '../types.js';
import { handleSlashCommand, } from './commands.js';

const env: Env = {
  SLACK_SIGNING_SECRET: 'secret',
  SLACK_BOT_TOKEN: 'xoxb-test',
  FRONTIS_URL: 'http://localhost:4000/graphql',
};
const ctx = {} as ExecutionContext;

function payload(command: string, user_name = 'alice', text = '',): SlashCommandPayload {
  return {
    token: 'tok',
    team_id: 'T1',
    team_domain: 'test',
    channel_id: 'C1',
    channel_name: 'general',
    user_id: 'U1',
    user_name,
    command,
    text,
    response_url: 'https://hooks.slack.com/respond',
    trigger_id: 'trigger1',
    api_app_id: 'A1',
  };
}

async function bodyOf(res: Response,): Promise<unknown> {
  const ct = res.headers.get('content-type',) ?? '';
  return ct.includes('application/json',) ? res.json() : res.text();
}

function mockFetch(data: unknown,): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data, },),
    },),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
},);

afterEach(() => {
  vi.unstubAllGlobals();
},);

describe('/help', () => {
  it('returns ephemeral text listing all commands', async () => {
    const res = await handleSlashCommand(payload('/help',), env, ctx,);
    expect(res.status,).toBe(200,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain('/help',);
    expect(body.text,).toContain('/version',);
    expect(body.text,).toContain('/ping',);
    expect(body.text,).toContain('/specialties',);
    expect(body.text,).toContain('/clubs',);
    expect(body.text,).toContain('/competitions',);
    expect(body.text,).toContain('/results',);
  });
});

describe('/version', () => {
  it('returns the version from package.json as ephemeral', async () => {
    const res = await handleSlashCommand(payload('/version',), env, ctx,);
    expect(res.status,).toBe(200,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain(pkg.version,);
  });
});

describe('/ping', () => {
  it('replies Hello @username to the channel', async () => {
    const res = await handleSlashCommand(payload('/ping', 'alice',), env, ctx,);
    expect(res.status,).toBe(200,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('in_channel',);
    expect(body.text,).toContain('Hello',);
    expect(body.text,).toContain('@alice',);
  });
});

describe('/specialties', () => {
  it('shows usage when no league is provided', async () => {
    const res = await handleSlashCommand(payload('/specialties',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Usage',);
  });

  it('returns a formatted list of specialties', async () => {
    mockFetch({
      specialties: [{ id: '1', name: 'Place Libre', }, { id: '2', name: 'Trinquet', },],
    },);
    const res = await handleSlashCommand(payload('/specialties', 'alice', 'lcapb',), env, ctx,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain('Place Libre',);
    expect(body.text,).toContain('Trinquet',);
  });

  it('handles empty list gracefully', async () => {
    mockFetch({ specialties: [], },);
    const res = await handleSlashCommand(payload('/specialties', 'alice', 'lcapb',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('No specialties found',);
  });

  it('returns an error message when the gateway fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Error', },),
    );
    const res = await handleSlashCommand(payload('/specialties', 'alice', 'lcapb',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Failed to fetch specialties',);
  });
});

describe('/clubs', () => {
  it('shows usage when no league is provided', async () => {
    const res = await handleSlashCommand(payload('/clubs',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Usage',);
  });

  it('returns a formatted list of clubs', async () => {
    mockFetch({ clubs: [{ id: '10', name: 'Denek Bat', },], },);
    const res = await handleSlashCommand(payload('/clubs', 'alice', 'lcapb',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Denek Bat',);
  });
});

describe('/competitions', () => {
  it('shows usage when no league is provided', async () => {
    const res = await handleSlashCommand(payload('/competitions',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Usage',);
  });

  it('returns a formatted list of competitions', async () => {
    mockFetch({
      competitions: [{ id: '5', name: 'Championnat LCAPB 2025-2026', source_id: null, },],
    },);
    const res = await handleSlashCommand(payload('/competitions', 'alice', 'lcapb',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Championnat LCAPB 2025-2026',);
  });
});

describe('/results', () => {
  it('shows usage when no league or competitionId is provided', async () => {
    const res = await handleSlashCommand(payload('/results', 'alice', '',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Usage',);
  });

  it('shows usage when competitionId is missing', async () => {
    const res = await handleSlashCommand(payload('/results', 'alice', 'lcapb',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Usage',);
  });

  it('returns formatted results for a competition', async () => {
    mockFetch({
      results: [
        {
          id: '99',
          dateMatch: '2025-10-01',
          phase: 'Finale',
          scores: '15/10',
          clubA: { id: '1', name: 'Denek Bat', },
          clubB: { id: '2', name: 'Noizbait', },
          specialty: { id: '3', name: 'Place Libre', },
        },
      ],
    },);
    const res = await handleSlashCommand(payload('/results', 'alice', 'lcapb 5',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Denek Bat',);
    expect(body.text,).toContain('Noizbait',);
    expect(body.text,).toContain('Finale',);
    expect(body.text,).toContain('15/10',);
  });

  it('handles empty results gracefully', async () => {
    mockFetch({ results: [], },);
    const res = await handleSlashCommand(payload('/results', 'alice', 'lcapb 999',), env, ctx,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('No results found',);
  });
});

describe('unknown command', () => {
  it('returns ephemeral error for unknown command', async () => {
    const res = await handleSlashCommand(payload('/foobar',), env, ctx,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain('Unknown command',);
  });
});
