/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

// --- Types ---

export interface Specialty {
  id: string;
  name: string;
}

export interface Club {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Competition {
  id: string;
  name: string;
  source_id: string | null;
}

export interface Result {
  id: string;
  dateMatch: string | null;
  phase: string | null;
  scores: string | null;
  clubA: { id: string; name: string; };
  clubB: { id: string; name: string; };
  specialty: { id: string; name: string; };
  category: { id: string; name: string; } | null;
}

// --- GraphQL queries ---

const LIST_SPECIALTIES = `
  query ListSpecialties {
    specialties { id name }
  }
`;

const LIST_CLUBS = `
  query ListClubs {
    clubs { id name }
  }
`;

const LIST_CATEGORIES = `
  query ListCategories {
    categories { id name }
  }
`;

const LIST_COMPETITIONS = `
  query ListCompetitions {
    competitions { id name source_id }
  }
`;

const LIST_RESULTS = `
  query ListResults($competitionId: ID, $specialtyId: ID, $categoryId: ID, $phase: String) {
    results(competitionId: $competitionId, specialtyId: $specialtyId, categoryId: $categoryId, phase: $phase) {
      id
      dateMatch
      phase
      scores
      clubA { id name }
      clubB { id name }
      specialty { id name }
      category { id name }
    }
  }
`;

// --- Client ---

async function gql<T,>(
  url: string,
  league: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Pilotariak-League': league,
    },
    body: JSON.stringify({ query, variables, },),
  },);
  if (!res.ok) {
    throw new Error(`Frontis request failed: ${res.status} ${res.statusText}`,);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string; }[]; };
  if (json.errors?.length) {
    throw new Error(`Frontis GraphQL error: ${json.errors.map((e,) => e.message).join(', ',)}`,);
  }
  if (!json.data) {
    throw new Error('Frontis returned no data',);
  }
  return json.data;
}

export async function listSpecialties(gatewayUrl: string, league: string,): Promise<Specialty[]> {
  const data = await gql<{ specialties: Specialty[]; }>(gatewayUrl, league, LIST_SPECIALTIES,);
  return data.specialties;
}

export async function listClubs(gatewayUrl: string, league: string,): Promise<Club[]> {
  const data = await gql<{ clubs: Club[]; }>(gatewayUrl, league, LIST_CLUBS,);
  return data.clubs;
}

export async function listCategories(gatewayUrl: string, league: string,): Promise<Category[]> {
  const data = await gql<{ categories: Category[]; }>(gatewayUrl, league, LIST_CATEGORIES,);
  return data.categories;
}

export async function listCompetitions(
  gatewayUrl: string,
  league: string,
): Promise<Competition[]> {
  const data = await gql<{ competitions: Competition[]; }>(gatewayUrl, league, LIST_COMPETITIONS,);
  return data.competitions;
}

export async function listResults(
  gatewayUrl: string,
  league: string,
  filters: { competitionId?: string; specialtyId?: string; categoryId?: string; phase?: string; },
): Promise<Result[]> {
  const data = await gql<{ results: Result[]; }>(gatewayUrl, league, LIST_RESULTS, filters,);
  return data.results;
}
