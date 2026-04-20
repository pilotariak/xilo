/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi, } from 'vitest';
import {
  listCategories,
  listClubs,
  listCompetitions,
  listResults,
  listSpecialties,
} from './client.js';

const GATEWAY = 'http://localhost:4000/graphql';

function mockFetch(data: unknown,): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data, },),
    },),
  );
}

function mockFetchError(status: number,): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      statusText: 'Internal Server Error',
    },),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
},);

afterEach(() => {
  vi.unstubAllGlobals();
},);

describe('listCategories', () => {
  it('returns categories from the gateway', async () => {
    mockFetch({ categories: [{ id: '1', name: '1ère Série', }, { id: '2', name: 'Seniors', },], },);
    const result = await listCategories(GATEWAY, 'lcapb',);
    expect(result,).toHaveLength(2,);
    expect(result[0]!.name,).toBe('1ère Série',);
  });

  it('throws on HTTP error', async () => {
    mockFetchError(500,);
    await expect(listCategories(GATEWAY, 'lcapb',),).rejects.toThrow('Frontis request failed',);
  });
});

describe('listSpecialties', () => {
  it('returns specialties from the gateway', async () => {
    mockFetch({ specialties: [{ id: '1', name: 'Place Libre', },], },);
    const result = await listSpecialties(GATEWAY, 'lcapb',);
    expect(result,).toEqual([{ id: '1', name: 'Place Libre', },],);
  });

  it('throws on HTTP error', async () => {
    mockFetchError(500,);
    await expect(listSpecialties(GATEWAY, 'lcapb',),).rejects.toThrow('Frontis request failed',);
  });
});

describe('listClubs', () => {
  it('returns clubs from the gateway', async () => {
    mockFetch({ clubs: [{ id: '10', name: 'Denek Bat', },], },);
    const result = await listClubs(GATEWAY, 'lcapb',);
    expect(result,).toEqual([{ id: '10', name: 'Denek Bat', },],);
  });
});

describe('listCompetitions', () => {
  it('returns competitions from the gateway', async () => {
    mockFetch({
      competitions: [{ id: '5', name: 'Championnat LCAPB 2025-2026', source_id: 'lcapb-2025', },],
    },);
    const result = await listCompetitions(GATEWAY, 'lcapb',);
    expect(result[0]!.name,).toBe('Championnat LCAPB 2025-2026',);
  });
});

describe('listResults', () => {
  it('returns results with filters', async () => {
    const mockResult = {
      id: '99',
      dateMatch: '2025-10-01',
      phase: 'Finale',
      scores: '15/10',
      clubA: { id: '1', name: 'Denek Bat', },
      clubB: { id: '2', name: 'Noizbait', },
      specialty: { id: '3', name: 'Place Libre', },
      category: { id: '1', name: '1ère Série', },
    };
    mockFetch({ results: [mockResult,], },);
    const result = await listResults(GATEWAY, 'lcapb', {
      competitionId: '5',
      categoryId: '1',
      phase: 'Finale',
    },);
    expect(result,).toHaveLength(1,);
    expect(result[0]!.phase,).toBe('Finale',);
  });

  it('throws on GraphQL errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ errors: [{ message: 'not found', },], },),
      },),
    );
    await expect(listResults(GATEWAY, 'lcapb', {},),).rejects.toThrow('Frontis GraphQL error',);
  });
});
