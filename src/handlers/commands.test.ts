/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi, } from 'vitest';
import pkg from '../../package.json';
import type { AgentJob, Env, SlashCommandPayload, } from '../types.js';
import { handleSlashCommand, } from './commands.js';

const env: Env = {
  SLACK_SIGNING_SECRET: 'secret',
  SLACK_BOT_TOKEN: 'xoxb-test',
  FRONTIS_URL: 'http://localhost:4000/graphql',
  AGENT_QUEUE: {
    send: vi.fn(),
  } as unknown as Queue<AgentJob>,
  AI: {} as Ai,
};

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
    const res = await handleSlashCommand(payload('/help',), env,);
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
    const res = await handleSlashCommand(payload('/version',), env,);
    expect(res.status,).toBe(200,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain(pkg.version,);
  });
});

describe('/ping', () => {
  it('replies Hello @username to the channel', async () => {
    const res = await handleSlashCommand(payload('/ping', 'alice',), env,);
    expect(res.status,).toBe(200,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('in_channel',);
    expect(body.text,).toContain('Hello',);
    expect(body.text,).toContain('@alice',);
  });
});

describe('/categories', () => {
  it('shows usage when no league is provided', async () => {
    const res = await handleSlashCommand(payload('/categories',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Usage',);
  });

  it('returns a formatted list of categories', async () => {
    mockFetch({
      categories: [{ id: '1', name: '1ère Série', }, { id: '2', name: 'Seniors', },],
    },);
    const res = await handleSlashCommand(payload('/categories', 'alice', 'lcapb',), env,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain('1ère Série',);
    expect(body.text,).toContain('Seniors',);
  });

  it('handles empty list gracefully', async () => {
    mockFetch({ categories: [], },);
    const res = await handleSlashCommand(payload('/categories', 'alice', 'lcapb',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('No categories found',);
  });

  it('returns an error message when the gateway fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Error', },),
    );
    const res = await handleSlashCommand(payload('/categories', 'alice', 'lcapb',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Failed to fetch categories',);
  });
});

describe('/specialties', () => {
  it('shows usage when no league is provided', async () => {
    const res = await handleSlashCommand(payload('/specialties',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Usage',);
  });

  it('returns a formatted list of specialties', async () => {
    mockFetch({
      specialties: [{ id: '1', name: 'Place Libre', }, { id: '2', name: 'Trinquet', },],
    },);
    const res = await handleSlashCommand(payload('/specialties', 'alice', 'lcapb',), env,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain('Place Libre',);
    expect(body.text,).toContain('Trinquet',);
  });

  it('handles empty list gracefully', async () => {
    mockFetch({ specialties: [], },);
    const res = await handleSlashCommand(payload('/specialties', 'alice', 'lcapb',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('No specialties found',);
  });

  it('returns an error message when the gateway fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Error', },),
    );
    const res = await handleSlashCommand(payload('/specialties', 'alice', 'lcapb',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Failed to fetch specialties',);
  });
});

describe('/clubs', () => {
  it('shows usage when no league is provided', async () => {
    const res = await handleSlashCommand(payload('/clubs',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Usage',);
  });

  it('returns a formatted list of clubs', async () => {
    mockFetch({ clubs: [{ id: '10', name: 'Denek Bat', },], },);
    const res = await handleSlashCommand(payload('/clubs', 'alice', 'lcapb',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Denek Bat',);
  });
});

describe('/competitions', () => {
  it('shows usage when no league is provided', async () => {
    const res = await handleSlashCommand(payload('/competitions',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Usage',);
  });

  it('returns a formatted list of competitions', async () => {
    mockFetch({
      competitions: [{ id: '5', name: 'Championnat LCAPB 2025-2026', source_id: null, },],
    },);
    const res = await handleSlashCommand(payload('/competitions', 'alice', 'lcapb',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Championnat LCAPB 2025-2026',);
  });
});

describe('/results', () => {
  it('shows usage when no league is provided', async () => {
    const res = await handleSlashCommand(payload('/results', 'alice', '',), env,);
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Usage',);
  });

  it('returns results filtered by competitionId', async () => {
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
          category: null,
        },
      ],
    },);
    const res = await handleSlashCommand(
      payload('/results', 'alice', 'lcapb competitionId=5',),
      env,
    );
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Denek Bat',);
    expect(body.text,).toContain('Noizbait',);
    expect(body.text,).toContain('Finale',);
    expect(body.text,).toContain('15/10',);
  });

  it('returns results filtered by multiple named params', async () => {
    mockFetch({
      results: [
        {
          id: '100',
          dateMatch: '2025-11-01',
          phase: '0',
          scores: '12/15',
          clubA: { id: '1', name: 'Denek Bat', },
          clubB: { id: '2', name: 'Noizbait', },
          specialty: { id: '3', name: 'Place Libre', },
          category: { id: '1', name: '1ère Série', },
        },
      ],
    },);
    const res = await handleSlashCommand(
      payload('/results', 'alice', 'lcapb competitionId=5 categoryId=1',),
      env,
    );
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Denek Bat',);
    expect(body.text,).toContain('1ère Série',);
  });

  it('returns results filtered by phase', async () => {
    mockFetch({
      results: [
        {
          id: '101',
          dateMatch: '2025-12-01',
          phase: 'Finale',
          scores: '15/12',
          clubA: { id: '1', name: 'Denek Bat', },
          clubB: { id: '2', name: 'Noizbait', },
          specialty: { id: '25', name: 'Place Libre', },
          category: { id: '246', name: '1ère Série', },
        },
      ],
    },);
    const res = await handleSlashCommand(
      payload(
        '/results',
        'alice',
        'lcapb competitionId=72 specialtyId=25 categoryId=246 phase=Finale',
      ),
      env,
    );
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('Finale',);
    expect(body.text,).toContain('Denek Bat',);
  });

  it('handles empty results gracefully', async () => {
    mockFetch({ results: [], },);
    const res = await handleSlashCommand(
      payload('/results', 'alice', 'lcapb competitionId=999',),
      env,
    );
    const body = await bodyOf(res,) as { text: string; };
    expect(body.text,).toContain('No results found',);
  });
});

describe('unknown command', () => {
  it('returns ephemeral error for unknown command', async () => {
    const res = await handleSlashCommand(payload('/foobar',), env,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain('Unknown command',);
  });
});
