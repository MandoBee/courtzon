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

export async function withdrawMatchResult(matchId: number | string): Promise<unknown> {
  const response = await api.post(`/matches/${matchId}/result/withdraw`);
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

export type MatchStatus = 'open' | 'full' | 'closed' | 'in_progress' | 'completed' | 'cancelled' | 'void';

export interface MatchListFilters {
  status?: MatchStatus;
  limit?: number;
  offset?: number;
}

export interface AdminMatchRow {
  id: number;
  publicId?: string | null;
  status: string;
  sportId: number;
  sportName?: string | null;
  branchId: number | null;
  branchName?: string | null;
  orgId: number | null;
  organisationName?: string | null;
  resourceName?: string | null;
  bookingDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  creatorName?: string | null;
  playedAt?: string | null;
  resultEntryOpen?: boolean | null;
  participantCount?: number;
  pendingRequests?: number;
}

export interface MatchListResult {
  matches: AdminMatchRow[];
  total: number;
}

async function unwrapMatchList(response: unknown): Promise<MatchListResult> {
  const inner = unwrapNestedData(response as any) as unknown;
  if (Array.isArray(inner)) return { matches: inner as AdminMatchRow[], total: inner.length };
  const boxed = inner as { matches?: AdminMatchRow[]; total?: number };
  return { matches: boxed?.matches ?? [], total: boxed?.total ?? 0 };
}

export async function fetchAdminMatches(filters: MatchListFilters = {}): Promise<MatchListResult> {
  const response = await api.get('/admin/matches', { params: filters });
  return unwrapMatchList(response);
}

export async function fetchOrgMatches(orgId: number | string, filters: MatchListFilters = {}): Promise<MatchListResult> {
  const response = await api.get(`/org/${orgId}/matches`, { params: filters });
  return unwrapMatchList(response);
}

export async function fetchOrgResults(orgId: number | string, status?: string): Promise<ResultListResult> {
  const response = await api.get(`/org/${orgId}/match-results`, { params: { status, limit: 50 } });
  return unwrapNestedData(response);
}

export async function resolveOrgDispute(
  orgId: number | string,
  resultId: number,
  body: { approve: boolean; displayResult?: RawMatchResultPayload; note?: string },
): Promise<unknown> {
  const response = await api.post(`/org/${orgId}/match-results/${resultId}/resolve`, body);
  return unwrapNestedData(response);
}

export async function correctOrgResult(
  orgId: number | string,
  resultId: number,
  payload: RawMatchResultPayload,
): Promise<unknown> {
  const response = await api.put(`/org/${orgId}/match-results/${resultId}/correct`, payload);
  return unwrapNestedData(response);
}