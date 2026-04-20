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

const LIST_COMPETITIONS = `
  query ListCompetitions {
    competitions { id name source_id }
  }
`;

const LIST_RESULTS = `
  query ListResults($competitionId: ID, $specialtyId: ID, $phase: String) {
    results(competitionId: $competitionId, specialtyId: $specialtyId, phase: $phase) {
      id
      dateMatch
      phase
      scores
      clubA { id name }
      clubB { id name }
      specialty { id name }
    }
  }
`;

// --- Client ---

async function gql<T,>(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', },
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

export async function listSpecialties(gatewayUrl: string,): Promise<Specialty[]> {
  const data = await gql<{ specialties: Specialty[]; }>(gatewayUrl, LIST_SPECIALTIES,);
  return data.specialties;
}

export async function listClubs(gatewayUrl: string,): Promise<Club[]> {
  const data = await gql<{ clubs: Club[]; }>(gatewayUrl, LIST_CLUBS,);
  return data.clubs;
}

export async function listCompetitions(gatewayUrl: string,): Promise<Competition[]> {
  const data = await gql<{ competitions: Competition[]; }>(gatewayUrl, LIST_COMPETITIONS,);
  return data.competitions;
}

export async function listResults(
  gatewayUrl: string,
  filters: { competitionId?: string; specialtyId?: string; phase?: string; },
): Promise<Result[]> {
  const data = await gql<{ results: Result[]; }>(gatewayUrl, LIST_RESULTS, filters,);
  return data.results;
}
