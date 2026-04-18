/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

// Replay attack window: requests older than 5 minutes are rejected
const SLACK_REPLAY_WINDOW_SECONDS = 5 * 60;

/**
 * Verifies a Slack request signature using HMAC-SHA256.
 *
 * Slack signs every request with a signature computed from:
 *   v0:<timestamp>:<raw-body>
 * using the app's signing secret as the HMAC key.
 *
 * Reference: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function verifySlackSignature(
  request: Request,
  body: string,
  signingSecret: string,
): Promise<boolean> {
  const timestamp = request.headers.get('x-slack-request-timestamp',);
  const slackSignature = request.headers.get('x-slack-signature',);

  if (!timestamp || !slackSignature) {
    return false;
  }

  // Reject replayed requests
  const now = Math.floor(Date.now() / 1000,);
  if (Math.abs(now - parseInt(timestamp, 10,),) > SLACK_REPLAY_WINDOW_SECONDS) {
    return false;
  }

  const sigBaseString = `v0:${timestamp}:${body}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret,),
    { name: 'HMAC', hash: 'SHA-256', },
    false,
    ['sign',],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBaseString,),);
  const computedSignature = 'v0=' + bufferToHex(signatureBuffer,);

  return timingSafeEqual(computedSignature, slackSignature,);
}

function bufferToHex(buffer: ArrayBuffer,): string {
  return Array.from(new Uint8Array(buffer,),)
    .map((b,) => b.toString(16,).padStart(2, '0',))
    .join('',);
}

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string,): boolean {
  if (a.length !== b.length) { return false; }
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a,);
  const bBytes = encoder.encode(b,);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}
