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

function payload(text: string, user_name = 'alice',): SlashCommandPayload {
  return {
    token: 'tok',
    team_id: 'T1',
    team_domain: 'test',
    channel_id: 'C1',
    channel_name: 'general',
    user_id: 'U1',
    user_name,
    command: '/xilo',
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

describe('/xilo help', () => {
  it('returns ephemeral text listing the 3 commands', async () => {
    const res = await handleSlashCommand(payload('help',), env, ctx,);
    expect(res.status,).toBe(200,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain('/xilo help',);
    expect(body.text,).toContain('/xilo version',);
    expect(body.text,).toContain('/xilo ping',);
  });

  it('defaults to help when text is empty', async () => {
    const res = await handleSlashCommand(payload('',), env, ctx,);
    const body = await bodyOf(res,) as { response_type: string; };
    expect(body.response_type,).toBe('ephemeral',);
  });
});

describe('/xilo version', () => {
  it('returns the version from package.json as ephemeral', async () => {
    const res = await handleSlashCommand(payload('version',), env, ctx,);
    expect(res.status,).toBe(200,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain(pkg.version,);
  });
});

describe('/xilo ping', () => {
  it('replies Hello @username to the channel', async () => {
    const res = await handleSlashCommand(payload('ping', 'alice',), env, ctx,);
    expect(res.status,).toBe(200,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('in_channel',);
    expect(body.text,).toContain('Hello',);
    expect(body.text,).toContain('@alice',);
  });
});

describe('/xilo unknown', () => {
  it('returns ephemeral error for unknown subcommand', async () => {
    const res = await handleSlashCommand(payload('foobar',), env, ctx,);
    const body = await bodyOf(res,) as { response_type: string; text: string; };
    expect(body.response_type,).toBe('ephemeral',);
    expect(body.text,).toContain('Unknown subcommand',);
  });
});
