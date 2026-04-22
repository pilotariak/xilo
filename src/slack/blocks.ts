/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { Category, Competition, Result, Specialty, } from '../frontis/client.js';
import type { SlackBlock, SlackOption, } from '../types.js';

const MAX_SELECT_OPTIONS = 100;

function option(text: string, value: string,): SlackOption {
  return { text: { type: 'plain_text', text, emoji: true, }, value, };
}

function sectionText(text: string, blockId?: string,): SlackBlock {
  const block: SlackBlock = { type: 'section', text: { type: 'mrkdwn', text, }, };
  if (blockId) {
    block.block_id = blockId;
  }
  return block;
}

function selectBlock(
  blockId: string,
  actionId: string,
  placeholder: string,
  options: SlackOption[],
): SlackBlock {
  return {
    type: 'section',
    block_id: blockId,
    text: { type: 'mrkdwn', text: ' ', },
    accessory: {
      type: 'static_select',
      action_id: actionId,
      placeholder: { type: 'plain_text', text: placeholder, },
      options,
    },
  };
}

/**
 * Step 1: select a competition.
 * block_id encodes the league so subsequent actions can recover it.
 * Returns an overflow notice instead of a select if competitions > 100.
 */
export function buildCompetitionSelect(league: string, competitions: Competition[],): SlackBlock[] {
  if (competitions.length === 0) {
    return [sectionText('No competitions found for this league.',),];
  }
  if (competitions.length > MAX_SELECT_OPTIONS) {
    return [
      sectionText(
        `*Too many competitions to display* (${competitions.length} found).\n`
          + `Use the filter argument directly:\n`
          + `\`/results ${league} competitionId=<id>\`\n`
          + `Run \`/competitions ${league}\` to see the full list with IDs.`,
      ),
    ];
  }
  return [
    sectionText(`*Results for \`${league}\`*\nChoose a competition:`,),
    selectBlock(
      `r:${league}`,
      'competition',
      'Select a competition…',
      competitions.map((c,) => option(c.name, c.id,)),
    ),
  ];
}

/**
 * Step 2: select a specialty.
 * block_id encodes league + competitionId.
 */
export function buildSpecialtySelect(
  league: string,
  competitionId: string,
  specialties: Specialty[],
): SlackBlock[] {
  if (specialties.length === 0) {
    return [sectionText('No specialties found.',),];
  }
  return [
    sectionText('Competition selected. Now choose a specialty:',),
    selectBlock(
      `r:${league}:${competitionId}`,
      'specialty',
      'Select a specialty…',
      specialties.map((s,) => option(s.name, s.id,)),
    ),
  ];
}

/**
 * Step 3: select a category.
 * block_id encodes league + competitionId + specialtyId.
 */
export function buildCategorySelect(
  league: string,
  competitionId: string,
  specialtyId: string,
  categories: Category[],
): SlackBlock[] {
  if (categories.length === 0) {
    return [sectionText('No categories found.',),];
  }
  return [
    sectionText('Specialty selected. Now choose a category:',),
    selectBlock(
      `r:${league}:${competitionId}:${specialtyId}`,
      'category',
      'Select a category…',
      categories.map((c,) => option(c.name, c.id,)),
    ),
  ];
}

/**
 * Step 4 (confirmation): summary of selections + "Fetch results" button.
 * block_id encodes all 4 IDs so the confirm action can call listResults directly.
 */
export function buildConfirmBlocks(
  league: string,
  competitionId: string,
  specialtyId: string,
  categoryId: string,
  categoryName: string,
): SlackBlock[] {
  return [
    sectionText(
      `*Ready to fetch results*\n`
        + `League: \`${league}\` · Category: *${categoryName}*\n`
        + `Click *Fetch results* to load the matches.`,
    ),
    {
      type: 'actions',
      block_id: `r:${league}:${competitionId}:${specialtyId}:${categoryId}`,
      elements: [
        {
          type: 'button',
          action_id: 'confirm',
          text: { type: 'plain_text', text: 'Fetch results', emoji: true, },
          style: 'primary',
        },
      ],
    },
  ];
}

/**
 * Step 5: display results.
 */
export function buildResultsBlocks(results: Result[],): SlackBlock[] {
  if (results.length === 0) {
    return [sectionText('No results found.',),];
  }
  const lines = results.map((r,) => {
    const date = r.dateMatch ?? '?';
    const phaseLabel = r.phase ? ` [${r.phase}]` : '';
    const score = r.scores ?? '?';
    const categoryLabel = r.category ? ` — ${r.category.name}` : '';
    return `• ${date}${phaseLabel} — *${r.clubA.name}* vs *${r.clubB.name}* ${score} (${r.specialty.name}${categoryLabel})`;
  },);
  return [sectionText(['*Results*', ...lines,].join('\n',),),];
}

/** Error block used when an interactive step fails. */
export function buildErrorBlocks(message: string,): SlackBlock[] {
  return [sectionText(`:warning: ${message}`,),];
}
