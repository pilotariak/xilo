/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, } from 'vitest';
import { verifySlackSignature, } from './verify.js';

const SIGNING_SECRET = 'test_signing_secret';

async function makeSignedRequest(
  body: string,
  secret: string,
  timestampOffset = 0,
): Promise<Request> {
  const timestamp = Math.floor(Date.now() / 1000,) + timestampOffset;
  const sigBaseString = `v0:${timestamp}:${body}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret,),
    { name: 'HMAC', hash: 'SHA-256', },
    false,
    ['sign',],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBaseString,),);
  const hex = Array.from(new Uint8Array(signatureBuffer,),)
    .map((b,) => b.toString(16,).padStart(2, '0',))
    .join('',);

  return new Request('https://example.com/slack/commands', {
    method: 'POST',
    headers: {
      'x-slack-request-timestamp': String(timestamp,),
      'x-slack-signature': `v0=${hex}`,
    },
    body,
  },);
}

describe('verifySlackSignature', () => {
  it('accepts a valid signature', async () => {
    const body = 'command=%2Fxilo&text=hello';
    const req = await makeSignedRequest(body, SIGNING_SECRET,);
    expect(await verifySlackSignature(req, body, SIGNING_SECRET,),).toBe(true,);
  });

  it('rejects an invalid signature', async () => {
    const body = 'command=%2Fxilo&text=hello';
    const req = await makeSignedRequest(body, 'wrong_secret',);
    expect(await verifySlackSignature(req, body, SIGNING_SECRET,),).toBe(false,);
  });

  it('rejects a replayed request (old timestamp)', async () => {
    const body = 'command=%2Fxilo&text=hello';
    const req = await makeSignedRequest(body, SIGNING_SECRET, -400,);
    // Even though the signature is valid, the timestamp is too old
    expect(await verifySlackSignature(req, body, SIGNING_SECRET,),).toBe(false,);
  });

  it('rejects a request with missing headers', async () => {
    const req = new Request('https://example.com/slack/commands', {
      method: 'POST',
      body: 'test',
    },);
    expect(await verifySlackSignature(req, 'test', SIGNING_SECRET,),).toBe(false,);
  });
});
