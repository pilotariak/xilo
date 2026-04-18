/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, } from 'vitest';
import pkg from '../../package.json';
import type { Env, SlashCommandPayload, } from '../types.js';
import { handleSlashCommand, } from './commands.js';

const env: Env = { SLACK_SIGNING_SECRET: 'secret', SLACK_BOT_TOKEN: 'xoxb-test', };
const ctx = {} as ExecutionContext;

function payload(command: string, user_name = 'alice',): SlashCommandPayload {
  return {
    token: 'tok',
    team_id: 'T1',
    team_domain: 'test',
    channel_id: 'C1',
    channel_name: 'general',
    user_id: 'U1',
    user_name,
    command,
    text: '',
    response_url: 'https://hooks.slack.com/respond',
    trigger_id: 'trigger1',
    api_app_id: 'A1',
  };
}

async function bodyOf(res: Response,): Promise<unknown> {
  const ct = res.headers.get('content-type',) ?? '';
  return ct.includes('application/json',) ? res.json() : res.text();
}

describe('/help', () => {
  it('returns ephemeral text listing the 3 commands', async () => {
    const res = await handleSlashCommand(payload('/help',), env, ctx,);
    expect(res.status,).toBe(200,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain('/help',);
    expect(body.text,).toContain('/version',);
    expect(body.text,).toContain('/ping',);
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

describe('unknown command', () => {
  it('returns ephemeral error for unknown command', async () => {
    const res = await handleSlashCommand(payload('/foobar',), env, ctx,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain('Unknown command',);
  });
});
