/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { listCategories, listResults, listSpecialties, } from '../frontis/client.js';
import { createLogger, } from '../logger.js';
import { updateInteractiveMessage, } from '../slack/api.js';
import {
  buildCategorySelect,
  buildConfirmBlocks,
  buildErrorBlocks,
  buildResultsBlocks,
  buildSpecialtySelect,
} from '../slack/blocks.js';
import type { Env, SlackBlockAction, SlackInteractivePayload, } from '../types.js';

/**
 * Handles POST /slack/interactive from Slack Block Kit interactions.
 *
 * Acknowledges immediately with 200 OK, then processes the action
 * asynchronously via ctx.waitUntil so GraphQL fetches and response_url
 * updates can happen after the HTTP response is sent.
 */
export async function handleInteractive(
  body: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const log = createLogger(env, { handler: 'interactive', },);

  const params = new URLSearchParams(body,);
  const raw = params.get('payload',);
  if (!raw) {
    log.warn('interactive request missing payload field',);
    return new Response('Bad Request', { status: 400, },);
  }

  let payload: SlackInteractivePayload;
  try {
    payload = JSON.parse(raw,) as SlackInteractivePayload;
  } catch {
    log.warn('interactive payload is not valid JSON',);
    return new Response('Bad Request', { status: 400, },);
  }

  if (payload.type !== 'block_actions' || !payload.actions?.length) {
    log.warn({ type: payload.type, }, 'unexpected interactive payload type',);
    return new Response('', { status: 200, },);
  }

  const action = payload.actions[0];
  log.info({ actionId: action.action_id, blockId: action.block_id, }, 'block action received',);

  // Acknowledge immediately — Slack requires a response within 3 seconds.
  ctx.waitUntil(processAction(action, payload.response_url, env, log,),);
  return new Response('', { status: 200, },);
}

async function processAction(
  action: SlackBlockAction,
  responseUrl: string,
  env: Env,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  try {
    const parts = action.block_id.split(':',);

    // All /results interactive block_ids start with 'r'
    if (parts[0] !== 'r' || parts.length < 2) {
      log.warn({ blockId: action.block_id, }, 'unrecognised block_id prefix',);
      return;
    }

    const league = parts[1];

    switch (action.action_id) {
      case 'competition': {
        const competitionId = action.selected_option!.value;
        log.debug({ league, competitionId, }, 'competition selected, fetching specialties',);
        const specialties = await listSpecialties(env.FRONTIS_URL, league,);
        await updateInteractiveMessage(
          responseUrl,
          'Specialty selection',
          buildSpecialtySelect(league, competitionId, specialties,),
        );
        break;
      }

      case 'specialty': {
        const competitionId = parts[2];
        const specialtyId = action.selected_option!.value;
        log.debug(
          { league, competitionId, specialtyId, },
          'specialty selected, fetching categories',
        );
        const categories = await listCategories(env.FRONTIS_URL, league,);
        await updateInteractiveMessage(
          responseUrl,
          'Category selection',
          buildCategorySelect(league, competitionId, specialtyId, categories,),
        );
        break;
      }

      case 'category': {
        const competitionId = parts[2];
        const specialtyId = parts[3];
        const categoryId = action.selected_option!.value;
        const categoryName = action.selected_option!.text.text;
        log.debug(
          { league, competitionId, specialtyId, categoryId, },
          'category selected, showing confirm',
        );
        await updateInteractiveMessage(
          responseUrl,
          'Confirm results search',
          buildConfirmBlocks(league, competitionId, specialtyId, categoryId, categoryName,),
        );
        break;
      }

      case 'confirm': {
        const competitionId = parts[2];
        const specialtyId = parts[3];
        const categoryId = parts[4];
        log.debug(
          { league, competitionId, specialtyId, categoryId, },
          'confirm clicked, fetching results',
        );
        const results = await listResults(env.FRONTIS_URL, league, {
          competitionId,
          specialtyId,
          categoryId,
        },);
        await updateInteractiveMessage(
          responseUrl,
          'Results',
          buildResultsBlocks(results,),
        );
        break;
      }

      default:
        log.warn({ actionId: action.action_id, }, 'unknown action_id',);
    }
  } catch (err) {
    log.error({ err: String(err,), }, 'error processing interactive action',);
    try {
      await updateInteractiveMessage(
        responseUrl,
        `Error: ${String(err,)}`,
        buildErrorBlocks(String(err,),),
      );
    } catch {
      // If even the error response fails, nothing more we can do
    }
  }
}
