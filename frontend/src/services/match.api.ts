import api from './api';
import { unwrapNestedData } from '../types/api';
import type { MatchListItem, MatchDetail, ApplicantData } from '../types/match';

export interface MatchesQuery {
  lat?: number;
  lng?: number;
  date?: string;
  sportId?: number;
}

export async function fetchMatches(query?: MatchesQuery): Promise<MatchListItem[]> {
  const response = await api.get('/matches', { params: query });
  return unwrapNestedData(response);
}

export async function fetchMatch(matchId: number): Promise<MatchDetail> {
  const response = await api.get(`/matches/${matchId}`);
  return unwrapNestedData(response);
}

export async function joinMatch(matchId: number): Promise<void> {
  await api.post(`/matches/${matchId}/join`);
}

export async function withdrawJoin(matchId: number): Promise<void> {
  await api.post(`/matches/${matchId}/withdraw`);
}

export async function fetchApplicants(matchId: number): Promise<ApplicantData> {
  const response = await api.get(`/matches/${matchId}/applicants`);
  return unwrapNestedData(response);
}

export async function approveApplicant(matchId: number, requestId: number, reason?: string): Promise<void> {
  await api.post(`/matches/${matchId}/applicants/${requestId}/approve`, { reason });
}

export async function rejectApplicant(matchId: number, requestId: number, reason?: string): Promise<void> {
  await api.post(`/matches/${matchId}/applicants/${requestId}/reject`, { reason });
}

export async function closeMatch(matchId: number): Promise<void> {
  await api.post(`/matches/${matchId}/close`);
}

export async function cancelMatch(matchId: number, reason?: string): Promise<void> {
  await api.post(`/matches/${matchId}/cancel`, { reason });
}
