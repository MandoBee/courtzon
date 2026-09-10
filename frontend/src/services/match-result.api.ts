import api from './api';
import { unwrapNestedData } from '../types/api';
import type {
  MatchResultWithParticipants,
  RawMatchResultPayload,
  ResultListResult,
  SportFormat,
  SportFormatsGroup,
} from '../types/match-result';

export async function fetchMatchResult(matchId: number | string): Promise<MatchResultWithParticipants> {
  const response = await api.get(`/matches/${matchId}/result`);
  return unwrapNestedData(response);
}

export async function submitMatchResult(matchId: number | string, payload: RawMatchResultPayload): Promise<unknown> {
  const response = await api.post(`/matches/${matchId}/result`, payload);
  return unwrapNestedData(response);
}

export async function replaceMatchResult(matchId: number | string, payload: RawMatchResultPayload): Promise<unknown> {
  const response = await api.put(`/matches/${matchId}/result`, payload);
  return unwrapNestedData(response);
}

export async function acceptMatchResult(matchId: number | string): Promise<unknown> {
  const response = await api.post(`/matches/${matchId}/result/accept`);
  return unwrapNestedData(response);
}

export async function disputeMatchResult(matchId: number | string, reason: string): Promise<unknown> {
  const response = await api.post(`/matches/${matchId}/result/dispute`, { reason });
  return unwrapNestedData(response);
}

export async function fetchMyResults(status?: string): Promise<ResultListResult> {
  const response = await api.get('/me/results', { params: { status, limit: 50 } });
  return unwrapNestedData(response);
}

export async function fetchSportFormats(sportId: number | string): Promise<SportFormatsGroup[]> {
  const response = await api.get(`/sports/${sportId}/formats`);
  return unwrapNestedData(response);
}

export async function fetchAllFormats(): Promise<SportFormat[]> {
  const response = await api.get('/sport-formats');
  return unwrapNestedData(response);
}

export async function fetchAdminResults(status?: string): Promise<ResultListResult> {
  const response = await api.get('/admin/match-results', { params: { status } });
  return unwrapNestedData(response);
}

export async function resolveDispute(
  resultId: number,
  body: { approve: boolean; displayResult?: RawMatchResultPayload; note?: string },
): Promise<unknown> {
  const response = await api.post(`/admin/match-results/${resultId}/resolve`, body);
  return unwrapNestedData(response);
}

export async function correctResult(resultId: number, payload: RawMatchResultPayload): Promise<unknown> {
  const response = await api.put(`/admin/match-results/${resultId}/correct`, payload);
  return unwrapNestedData(response);
}