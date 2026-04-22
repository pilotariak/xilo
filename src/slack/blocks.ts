/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { Category, ClubLineup, Competition, Result, Specialty, } from '../frontis/client.js';
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

// Slack section block mrkdwn text is capped at 3000 chars.
// Stay well under that by chunking rows (~150 chars each, max 15 per block).
const RESULTS_PER_BLOCK = 15;

/**
 * Maps a phase code to an emoji.
 * Phase order: P → B1T/B2T/B3T → H → Q → D → F
 */
function phaseEmoji(phase: string | null,): string {
  if (!phase) { return '❓'; }
  const p = phase.trim().toUpperCase();
  if (p.startsWith('F',)) { return '🏆'; // Finale
   }
  if (p.startsWith('D',)) { return '🥊'; // Demi-finale
   }
  if (p.startsWith('Q',)) { return '🔷'; // Quart de finale
   }
  if (p.startsWith('H',)) { return '🔶'; // Huitième de finale
   }
  if (p.startsWith('B',)) { return '🟡'; // Barrages (B1T / B2T / B3T)
   }
  return '🔵'; // Poule
}

/** Maps a phase string to its canonical type key (e.g. "P 13" → "P", "B1T 2" → "B1T"). */
function phaseTypeKey(phase: string | null,): string {
  if (!phase) { return ''; }
  const p = phase.trim().toUpperCase();
  if (p.startsWith('F',)) { return 'F'; }
  if (p.startsWith('D',)) { return 'D'; }
  if (p.startsWith('Q',)) { return 'Q'; }
  if (p.startsWith('H',)) { return 'H'; }
  if (p.startsWith('B3',)) { return 'B3T'; }
  if (p.startsWith('B2',)) { return 'B2T'; }
  if (p.startsWith('B1',)) { return 'B1T'; }
  if (p.startsWith('B',)) { return 'B'; }
  return 'P';
}

const PHASE_LABEL: Readonly<Record<string, string>> = {
  P: 'Poules',
  B1T: 'Barrages 1er Tour',
  B2T: 'Barrages 2ème Tour',
  B3T: 'Barrages 3ème Tour',
  B: 'Barrages',
  H: 'Huitièmes de finale',
  Q: 'Quarts de finale',
  D: 'Demi-finales',
  F: 'Finale',
};

/**
 * Returns a numeric sort key for a phase string.
 * Lower = earlier in competition: P (0-999) → B (1000+) → H (2000+) → Q (3000+) → D (4000+) → F (5000+).
 * The trailing round number is added so P 1 < P 2 < … < P 18.
 */
function phaseSortKey(phase: string | null,): number {
  if (!phase) { return 9999; }
  const p = phase.trim().toUpperCase();
  const n = parseInt(p.replace(/\D/g, '',) || '0', 10,);
  if (p.startsWith('F',)) { return 5000 + n; }
  if (p.startsWith('D',)) { return 4000 + n; }
  if (p.startsWith('Q',)) { return 3000 + n; }
  if (p.startsWith('H',)) { return 2000 + n; }
  if (p.startsWith('B3',)) { return 1300 + n; }
  if (p.startsWith('B2',)) { return 1200 + n; }
  if (p.startsWith('B1',)) { return 1100 + n; }
  if (p.startsWith('B',)) { return 1000 + n; }
  return n; // Poule: just the round number
}

/** Parses "A/B" score into { a, b }, returns null if unparseable. */
function parseScore(scores: string | null,): { a: number; b: number; } | null {
  if (!scores) { return null; }
  const m = scores.match(/^(\d+)[/\-](\d+)$/,);
  if (!m) { return null; }
  return { a: parseInt(m[1], 10,), b: parseInt(m[2], 10,), };
}

/** Returns "Player1 / Player2" (or just "Player1") from a lineup, null if empty. */
function formatLineup(lineup: ClubLineup | null | undefined,): string | null {
  if (!lineup) { return null; }
  const names = [lineup.player1?.name, lineup.player2?.name,].filter(Boolean,) as string[];
  return names.length > 0 ? names.join(' / ',) : null;
}

/** Formats a single match entry (1–2 lines) with bold winner and italic players. */
function matchLine(r: Result,): string {
  const date = r.dateMatch ?? '?';
  const emoji = phaseEmoji(r.phase,);
  const phase = r.phase ? ` ${emoji} \`${r.phase}\`` : '';

  const parsed = parseScore(r.scores,);
  let clubA = r.clubA.name;
  let clubB = r.clubB.name;
  let scoreStr = r.scores ? ` *${r.scores}*` : ' _?_';

  if (parsed) {
    const [sa, sb,] = [
      String(r.scores?.split(/[/\-]/,)[0],),
      String(r.scores?.split(/[/\-]/,)[1],),
    ];
    if (parsed.a > parsed.b) {
      clubA = `*${clubA}*`;
      scoreStr = ` *${sa}*/${sb}`;
    } else if (parsed.b > parsed.a) {
      clubB = `*${clubB}*`;
      scoreStr = ` ${sa}/*${sb}*`;
    } else {
      scoreStr = ` *${r.scores}*`; // draw
    }
  }

  const lineupA = formatLineup(r.clubALineup,);
  const lineupB = formatLineup(r.clubBLineup,);
  const playersLine = (lineupA || lineupB)
    ? `\n  ↳ _${lineupA ?? '?'}_ vs _${lineupB ?? '?'}_`
    : '';

  return `• ${date}${phase} — ${clubA} vs ${clubB} —${scoreStr}${playersLine}`;
}

/** Groups results by specialty + category, preserving insertion order. */
function groupBySpecialtyCategory(
  results: Result[],
): Array<{ label: string; items: Result[]; }> {
  const map = new Map<string, { label: string; items: Result[]; }>();
  for (const r of results) {
    const key = `${r.specialty.id}:${r.category?.id ?? ''}`;
    if (!map.has(key,)) {
      const catPart = r.category ? ` — ${r.category.name}` : '';
      map.set(key, { label: `${r.specialty.name}${catPart}`, items: [], },);
    }
    map.get(key,)!.items.push(r,);
  }
  return Array.from(map.values(),);
}

/**
 * Step 5: display results grouped by specialty / category.
 * Within each group, matches are sorted by phase order (P → B → H → Q → D → F)
 * then by round number. Winner's club name and score are bolded.
 * Splits into multiple section blocks to stay under Slack's 3000-char limit.
 */
export function buildResultsBlocks(results: Result[],): SlackBlock[] {
  if (results.length === 0) {
    return [sectionText('No results found.',),];
  }

  const groups = groupBySpecialtyCategory(results,);
  const total = results.length;
  const blocks: SlackBlock[] = [
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `🏐 *${total}* match${total === 1 ? '' : 'es'} found`, },],
    },
  ];

  let first = true;
  for (const { label, items, } of groups) {
    if (!first) {
      blocks.push({ type: 'divider', },);
    }
    first = false;

    // Slack header block: plain_text only, max 150 chars
    const headerText = `🏆 ${label}`;
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: headerText.slice(0, 150,), emoji: true, },
    },);

    const sorted = [...items,].sort((a, b,) => phaseSortKey(a.phase,) - phaseSortKey(b.phase,));

    // Sub-group by phase type and emit a context header per phase
    let currentPhaseKey: string | null = null;
    let phaseLines: string[] = [];

    const flushPhase = (key: string | null,) => {
      if (phaseLines.length === 0) { return; }
      const label = (key && PHASE_LABEL[key])
        ? `${phaseEmoji(sorted.find((r,) => phaseTypeKey(r.phase,) === key)?.phase ?? null,)} *${
          PHASE_LABEL[key]
        }*`
        : '*Matches*';
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: label, },], },);
      for (let i = 0; i < phaseLines.length; i += RESULTS_PER_BLOCK) {
        blocks.push(sectionText(phaseLines.slice(i, i + RESULTS_PER_BLOCK,).join('\n',),),);
      }
      phaseLines = [];
    };

    for (const r of sorted) {
      const key = phaseTypeKey(r.phase,);
      if (key !== currentPhaseKey) {
        flushPhase(currentPhaseKey,);
        currentPhaseKey = key;
      }
      phaseLines.push(matchLine(r,),);
    }
    flushPhase(currentPhaseKey,);
  }

  return blocks;
}

/** Error block used when an interactive step fails. */
export function buildErrorBlocks(message: string,): SlackBlock[] {
  return [sectionText(`:warning: ${message}`,),];
}
