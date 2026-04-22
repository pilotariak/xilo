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
  /** Which AI provider to use for /ask (default: 'workers-ai') */
  AGENT_PROVIDER?: string;
  /** Cloudflare Workers AI model name (e.g. '@cf/meta/llama-3.1-8b-instruct') */
  WORKERS_AI_MODEL?: string;
  /** Fallback league when the user doesn't specify one in their @mention or DM (e.g. 'lcapb') */
  DEFAULT_LEAGUE?: string;
  /** Pino log level: 'trace' | 'debug' | 'info' | 'warn' | 'error' (default: 'info') */
  LOG_LEVEL?: string;
  /** Cloudflare Queue binding for async agent jobs. */
  AGENT_QUEUE: Queue<AgentJob>;
  /** Cloudflare Workers AI binding. */
  AI: any;
}

/** Message sent to AGENT_QUEUE for async agent execution. */
export interface AgentJob {
  /** Slack channel ID — used for postMessage replies. */
  channel: string;
  /** Present when the reply should go into an existing thread. */
  threadTs?: string;
  /** League code (e.g. 'lcapb'). */
  league: string;
  /** The user's question (without league prefix). */
  question: string;
  /** Whether to post GraphQL debug blocks alongside the answer. */
  debugMode: boolean;
  /**
   * When set (slash command path), the answer is delivered via Slack
   * response_url (sendDelayedResponse) instead of chat.postMessage.
   */
  responseUrl?: string;
}

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

export interface SlackOption {
  text: { type: 'plain_text'; text: string; emoji?: boolean; };
  value: string;
}

export interface SlackBlock {
  type: string;
  block_id?: string;
  text?: { type: string; text: string; };
  accessory?: {
    type: string;
    action_id: string;
    placeholder: { type: 'plain_text'; text: string; };
    options: SlackOption[];
  };
  elements?: object[];
}

// Slack Interactive Components payload (block_actions)
// https://docs.slack.dev/reference/interaction-payloads/block-actions
export interface SlackInteractivePayload {
  type: 'block_actions';
  user: { id: string; name: string; };
  channel: { id: string; };
  response_url: string;
  actions: SlackBlockAction[];
}

export interface SlackBlockAction {
  type: string;
  /** Identifies what step we're on: 'competition' | 'specialty' | 'category' | 'confirm' */
  action_id: string;
  /**
   * Encodes accumulated state as colon-delimited segments:
   *   r:{league}                                        (step 1 → 2)
   *   r:{league}:{competitionId}                        (step 2 → 3)
   *   r:{league}:{competitionId}:{specialtyId}          (step 3 → confirm)
   *   r:{league}:{competitionId}:{specialtyId}:{catId}  (confirm → results)
   */
  block_id: string;
  /** Present for static_select actions; absent for button actions. */
  selected_option?: {
    value: string;
    text: { type: string; text: string; };
  };
  /** Present for button actions. */
  value?: string;
}
