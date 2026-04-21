/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { ToolDefinition, } from './types.js';

/**
 * Frontis tools exposed to the LLM.
 * The agent must look up IDs with the list_* tools before calling list_results.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_competitions',
    description:
      'List all competitions for a league. Use this to find a competition ID by its name.',
    parameters: {
      type: 'object',
      properties: {
        league: { type: 'string', description: 'League code (e.g. lcapb, ccapb)', },
      },
      required: ['league',],
    },
  },
  {
    name: 'list_specialties',
    description:
      'List all Basque pelota disciplines/specialties (e.g. Trinquet, Cesta Punta, Mur à Gauche). Use this to find a specialty ID by name.',
    parameters: {
      type: 'object',
      properties: {
        league: { type: 'string', description: 'League code', },
      },
      required: ['league',],
    },
  },
  {
    name: 'list_categories',
    description:
      'List all player categories (e.g. 1ère Série, 2ème Série, Vétérans). Use this to find a category ID by name.',
    parameters: {
      type: 'object',
      properties: {
        league: { type: 'string', description: 'League code', },
      },
      required: ['league',],
    },
  },
  {
    name: 'list_clubs',
    description: 'List all clubs for a league.',
    parameters: {
      type: 'object',
      properties: {
        league: { type: 'string', description: 'League code', },
      },
      required: ['league',],
    },
  },
  {
    name: 'list_results',
    description:
      'List match results, optionally filtered by competition ID, specialty ID, category ID, or phase. Always resolve names to IDs using the list_* tools before calling this.',
    parameters: {
      type: 'object',
      properties: {
        league: { type: 'string', description: 'League code', },
        competitionId: { type: 'string', description: 'Filter by competition ID (optional)', },
        specialtyId: { type: 'string', description: 'Filter by specialty ID (optional)', },
        categoryId: { type: 'string', description: 'Filter by category ID (optional)', },
        phase: { type: 'string', description: 'Filter by phase name (optional)', },
      },
      required: ['league',],
    },
  },
];
