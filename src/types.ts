/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

export interface Env {
  SLACK_SIGNING_SECRET: string;
  SLACK_BOT_TOKEN: string;
  FRONTIS_URL: string;
  ENVIRONMENT?: string;
  /** Which AI provider to use for /ask: 'gemini' | 'mistral' | 'claude' (default: 'gemini') */
  AGENT_PROVIDER?: string;
  /** Anthropic API key — required when AGENT_PROVIDER=claude */
  ANTHROPIC_API_KEY?: string;
  /** Google AI API key — required when AGENT_PROVIDER=gemini */
  GEMINI_API_KEY?: string;
  /** Override the Gemini/Gemma model name (e.g. 'gemma-4-26b-a4b-it' for free Gemma 4) */
  GEMINI_MODEL?: string;
  /** Fallback league when the user doesn't specify one in their @mention or DM (e.g. 'lcapb') */
  DEFAULT_LEAGUE?: string;
  /** Pino log level: 'trace' | 'debug' | 'info' | 'warn' | 'error' (default: 'info') */
  LOG_LEVEL?: string;
  /** Mistral AI API key — required when AGENT_PROVIDER=mistral */
  MISTRAL_API_KEY?: string;
}

// Slack slash command payload
export interface SlashCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
  api_app_id: string;
}

// Slack Events API — outer envelope
// https://docs.slack.dev/apis/events-api/
export interface SlackEventPayload {
  /** Deprecated — do not use for auth. Verify via x-slack-signature instead. */
  token: string;
  team_id: string;
  api_app_id: string;
  /** 'url_verification' | 'event_callback' | 'app_rate_limited' */
  type: string;
  /** Present only for url_verification handshake */
  challenge?: string;
  /** Globally unique event ID — use for deduplication */
  event_id?: string;
  /** Unix epoch seconds when the event was dispatched */
  event_time?: number;
  /** Identifier for apps.event.authorizations.list API */
  event_context?: string;
  /** Inner event object; present for event_callback type */
  event?: SlackEvent;
  /** Installations that granted access to this event */
  authorizations?: SlackAuthorization[];
  context_team_id?: string;
  context_enterprise_id?: string | null;
  is_ext_shared_channel?: boolean;
  /** Present only for app_rate_limited type */
  minute_rate_limited?: number;
}

export interface SlackAuthorization {
  enterprise_id: string | null;
  team_id: string;
  user_id: string;
  is_bot: boolean;
  is_enterprise_install: boolean;
}

export interface SlackEvent {
  type: string;
  /** Unix epoch timestamp as a Slack ts string (e.g. "1465244570.336841") */
  event_ts?: string;
  user?: string;
  text?: string;
  channel?: string;
  /** Message timestamp — use as thread_ts to reply in-thread. */
  ts?: string;
  /** Set when the message is already inside a thread. */
  thread_ts?: string;
  /** 'im' for DMs, 'channel' for public channels, 'group' for private channels. */
  channel_type?: string;
  bot_id?: string;
}

// Slack Block Kit message
export interface SlackMessage {
  response_type?: 'in_channel' | 'ephemeral';
  text: string;
  blocks?: SlackBlock[];
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
}
