import api from './api';
import type { PaginatedResult } from '../types/api';

export const tournamentApi = {
  // Admin
  getDashboard: () => api.get('/admin/tournaments/dashboard').then(r => r.data),
  getTournaments: (params?: Record<string, any>) =>
    api.get<PaginatedResult<any>>('/admin/tournaments', { params }).then(r => r.data),
  getTournament: (id: number) => api.get<any>(`/admin/tournaments/${id}`).then(r => r.data),
  // G11 Phase 3 — there is NO platform-wide tournament creation. The CourtZon
  // platform never creates, owns, funds, or recognises a tournament, so
  // `POST /admin/tournaments` is gone. Creating on behalf of an organisation goes
  // through `orgTournamentApi.createTournament(orgId, data)`, which targets the
  // authoritative organisation-scoped route `POST /org/:orgId/tournaments`.
  updateTournament: (id: number, data: any) => api.put<any>(`/admin/tournaments/${id}`, data).then(r => r.data),
  publish: (id: number) => api.post(`/admin/tournaments/${id}/publish`).then(r => r.data),
  openRegistration: (id: number) => api.post(`/admin/tournaments/${id}/open-reg`).then(r => r.data),
  closeRegistration: (id: number) => api.post(`/admin/tournaments/${id}/close-reg`).then(r => r.data),
  start: (id: number) => api.post(`/admin/tournaments/${id}/start`).then(r => r.data),
  complete: (id: number) => api.post(`/admin/tournaments/${id}/complete`).then(r => r.data),
  cancel: (id: number) => api.post(`/admin/tournaments/${id}/cancel`).then(r => r.data),
  archive: (id: number) => api.post(`/admin/tournaments/${id}/archive`).then(r => r.data),

  getGroups: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/groups`).then(r => r.data),
  generateGroups: (tournamentId: number, groupSize: number, advanceCount: number) =>
    api.post(`/admin/tournaments/${tournamentId}/generate-groups`, { group_size: groupSize, advance_count: advanceCount }).then(r => r.data),

  getMatches: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/matches`).then(r => r.data),
  assignCourt: (matchId: number, resourceId: number) =>
    api.put(`/admin/tournaments/matches/${matchId}/court`, { resource_id: resourceId }).then(r => r.data),
  assignReferee: (matchId: number, refereeId: number) =>
    api.put(`/admin/tournaments/matches/${matchId}/referee`, { referee_id: refereeId }).then(r => r.data),
  startMatch: (matchId: number) => api.post(`/admin/tournaments/matches/${matchId}/start`).then(r => r.data),
  completeMatch: (matchId: number) => api.post(`/admin/tournaments/matches/${matchId}/complete`).then(r => r.data),
  // T-B — tournament results are recorded through the AUTHORITATIVE shared Match
  // Result lifecycle (outcome + winner side + structured score, NOT winner_id).
  recordResult: (matchId: number, data: any) =>
    api.post(`/admin/tournaments/matches/${matchId}/result`, data).then(r => r.data),

  getStandings: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/standings`).then(r => r.data),

  getRegistrations: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/registrations`).then(r => r.data),
  register: (tournamentId: number, playerId: number, teamId?: number) =>
    api.post(`/admin/tournaments/${tournamentId}/register`, { player_id: playerId, team_id: teamId }).then(r => r.data),
  cancelRegistration: (regId: number) => api.post(`/admin/tournaments/registrations/${regId}/cancel`).then(r => r.data),
  confirmRegistration: (regId: number) => api.post(`/admin/tournaments/registrations/${regId}/confirm`).then(r => r.data),

  // G11.5 — prize award management (workbench; org path is org-scoped mirror).
  // The backend routes are guarded by tournaments.awards.{view,grant,refund}.
  getAwardablePrizes: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/awards/prizes`).then(r => r.data),
  getPrizeAwards: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/awards`).then(r => r.data),
  grantPrizeAward: (tournamentId: number, prizeId: number, winnerUserId: number) =>
    api.post(`/admin/tournaments/${tournamentId}/awards`, { prizeId, winnerUserId }).then(r => r.data),
  refundPrizeAward: (awardId: number, reason?: string) =>
    api.post(`/admin/tournaments/awards/${awardId}/refund`, { reason }).then(r => r.data),

  // Public
  getPublicTournaments: (params?: Record<string, any>) =>
    api.get<PaginatedResult<any>>('/tournaments', { params }).then(r => r.data),
  getPublicTournament: (id: number) => api.get<any>(`/tournaments/${id}`).then(r => r.data),
  getPublicBracket: (id: number) => api.get(`/tournaments/${id}/bracket`).then(r => r.data),
  getPublicStandings: (id: number) => api.get(`/tournaments/${id}/standings`).then(r => r.data),
  getPublicMatches: (id: number) => api.get(`/tournaments/${id}/matches`).then(r => r.data),
  getPublicParticipants: (id: number) => api.get(`/tournaments/${id}/participants`).then(r => r.data),
  // Group 3 — the player declares the entry-fee payment method (cash|card). The
  // backend validates it against the tournament's effective allowed methods.
  // G11.18 Phase 2 — the player may also select the competition category.
  publicRegister: (tournamentId: number, paymentMethod?: 'cash' | 'card', competitionId?: number) =>
    api.post(`/tournaments/${tournamentId}/register`, {
      payment_method: paymentMethod,
      competition_id: competitionId,
    }).then(r => r.data),
  // G11.18 Phase 2 — competition categories for the registration UI.
  listCompetitions: (tournamentId: number) =>
    api.get<{ data: any[] }>(`/tournaments/${tournamentId}/competitions`).then((r) => r.data?.data || []),
  // Phase 2 — READ-ONLY tournament finances (admin, financial.reconcile).
  getFinances: (id: number) => api.get<any>(`/admin/tournaments/${id}/finances`).then(r => r.data?.data || r.data),
};

// ── G11.16 — public / anonymous tournament discovery (no auth, is_public=1 only) ──
export const publicTournamentApi = {
  list: (params?: Record<string, any>) =>
    api.get<{ data: any[] }>('/public/tournaments', { params }).then((r) => r.data?.data || []),
  get: (id: number) =>
    api.get<{ data: any }>(`/public/tournaments/${id}`).then((r) => r.data?.data || r.data),
};

// ── G11.17 — player team self-service (non-financial) ──
export const tournamentTeamApi = {
  createTeam: (tournamentId: number, data: { name?: string; memberUserIds?: number[]; competitionId?: number }) =>
    api.post(`/tournaments/${tournamentId}/teams`, data).then((r) => r.data),
  listTeams: (tournamentId: number) =>
    api.get<{ data: any }>(`/tournaments/${tournamentId}/teams`).then((r) => r.data?.data),
  joinTeam: (tournamentId: number, participantId: number) =>
    api.post(`/tournaments/${tournamentId}/teams/${participantId}/join`).then((r) => r.data),
  invite: (tournamentId: number, participantId: number, inviteeUserId: number) =>
    api.post(`/tournaments/${tournamentId}/teams/${participantId}/invitations`, { inviteeUserId }).then((r) => r.data),
  listSent: (tournamentId: number, participantId: number) =>
    api.get<{ data: any }>(`/tournaments/${tournamentId}/teams/${participantId}/invitations`).then((r) => r.data?.data),
  listMine: () =>
    api.get<{ data: any }>('/tournaments/team-invitations/mine').then((r) => r.data?.data),
  accept: (tournamentId: number, invitationId: number) =>
    api.post(`/tournaments/${tournamentId}/team-invitations/${invitationId}/accept`).then((r) => r.data),
  reject: (tournamentId: number, invitationId: number) =>
    api.post(`/tournaments/${tournamentId}/team-invitations/${invitationId}/reject`).then((r) => r.data),
};

// Organisation-scoped tournament API — mirrors the admin workbench methods but
// routes through the tenant-scoped `/org/:orgId/tournaments` endpoints. Both
// contexts share the same authoritative tournamentService on the backend.
export const orgTournamentApi = {
  getTournaments: (orgId: number | string, params?: Record<string, any>) =>
    api.get<PaginatedResult<any>>(`/org/${orgId}/tournaments`, { params }).then(r => r.data),
  getTournament: (orgId: number | string, id: number) => api.get<any>(`/org/${orgId}/tournaments/${id}`).then(r => r.data),
  createTournament: (orgId: number | string, data: any) => api.post<any>(`/org/${orgId}/tournaments`, data).then(r => r.data),
  // Phase 2 — READ-ONLY org tournament finances (org financial users).
  getFinances: (orgId: number | string, id: number) => api.get<any>(`/org/${orgId}/tournaments/${id}/finances`).then(r => r.data?.data || r.data),
  // G11.9 — READ-ONLY org tournament finance AGGREGATE (per-currency buckets).
  getFinanceAggregate: (orgId: number | string) => api.get<any>(`/org/${orgId}/tournaments/finances`).then(r => r.data?.data || r.data),
  updateTournament: (orgId: number | string, id: number, data: any) => api.put<any>(`/org/${orgId}/tournaments/${id}`, data).then(r => r.data),
  publish: (orgId: number | string, id: number) => api.post(`/org/${orgId}/tournaments/${id}/publish`).then(r => r.data),
  openRegistration: (orgId: number | string, id: number) => api.post(`/org/${orgId}/tournaments/${id}/open-reg`).then(r => r.data),
  closeRegistration: (orgId: number | string, id: number) => api.post(`/org/${orgId}/tournaments/${id}/close-reg`).then(r => r.data),
  start: (orgId: number | string, id: number) => api.post(`/org/${orgId}/tournaments/${id}/start`).then(r => r.data),
  complete: (orgId: number | string, id: number) => api.post(`/org/${orgId}/tournaments/${id}/complete`).then(r => r.data),
  cancel: (orgId: number | string, id: number) => api.post(`/org/${orgId}/tournaments/${id}/cancel`).then(r => r.data),
  archive: (orgId: number | string, id: number) => api.post(`/org/${orgId}/tournaments/${id}/archive`).then(r => r.data),
  getGroups: (orgId: number | string, tournamentId: number) => api.get(`/org/${orgId}/tournaments/${tournamentId}/groups`).then(r => r.data),
  generateGroups: (orgId: number | string, tournamentId: number, groupSize: number, advanceCount: number) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/generate-groups`, { group_size: groupSize, advance_count: advanceCount }).then(r => r.data),
  getMatches: (orgId: number | string, tournamentId: number) => api.get(`/org/${orgId}/tournaments/${tournamentId}/matches`).then(r => r.data),
  assignCourt: (orgId: number | string, matchId: number, resourceId: number) =>
    api.put(`/org/${orgId}/tournaments/matches/${matchId}/court`, { resource_id: resourceId }).then(r => r.data),
  assignReferee: (orgId: number | string, matchId: number, refereeId: number) =>
    api.put(`/org/${orgId}/tournaments/matches/${matchId}/referee`, { referee_id: refereeId }).then(r => r.data),
  startMatch: (orgId: number | string, matchId: number) =>
    api.post(`/org/${orgId}/tournaments/matches/${matchId}/start`).then(r => r.data),
  completeMatch: (orgId: number | string, matchId: number) =>
    api.post(`/org/${orgId}/tournaments/matches/${matchId}/complete`).then(r => r.data),
  recordResult: (orgId: number | string, matchId: number, data: any) =>
    api.post(`/org/${orgId}/tournaments/matches/${matchId}/result`, data).then(r => r.data),
  getStandings: (orgId: number | string, tournamentId: number) => api.get(`/org/${orgId}/tournaments/${tournamentId}/standings`).then(r => r.data),
  getRegistrations: (orgId: number | string, tournamentId: number) => api.get(`/org/${orgId}/tournaments/${tournamentId}/registrations`).then(r => r.data),
  register: (orgId: number | string, tournamentId: number, teamId?: number, paymentMethod?: 'cash' | 'card') =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/register`, { team_id: teamId, payment_method: paymentMethod }).then(r => r.data),
  cancelRegistration: (orgId: number | string, regId: number) => api.post(`/org/${orgId}/tournaments/registrations/${regId}/cancel`).then(r => r.data),
  confirmRegistration: (orgId: number | string, regId: number) => api.post(`/org/${orgId}/tournaments/registrations/${regId}/confirm`).then(r => r.data),
  // Group 5B-SR — org-scoped configuration reads (create form)
  getBracketTypes: (orgId: number | string) => api.get(`/org/${orgId}/tournaments/bracket-types`).then(r => r.data),
  getCommissionConfig: (orgId: number | string) => api.get(`/org/${orgId}/tournaments/commission-config`).then(r => r.data),
  getSportFormats: (orgId: number | string, sportId: number | string, bracketTypeId?: number | string) =>
    api.get(`/org/${orgId}/tournaments/sports/${sportId}/formats`, { params: bracketTypeId ? { bracket_type_id: bracketTypeId } : undefined }).then(r => r.data),
  // G11.20 — Competition Category Management (org-scoped, fail-closed tenancy).
  // These are deliberately NOT the public `/tournaments/:id/competitions` read
  // shape: management needs the raw rows plus tenancy-guarded writes.
  listCompetitions: (orgId: number | string, tournamentId: number) =>
    api.get<{ data: any[] }>(`/org/${orgId}/tournaments/${tournamentId}/competitions`).then(r => r.data?.data || []),
  createCompetition: (orgId: number | string, tournamentId: number, data: any) =>
    api.post<any>(`/org/${orgId}/tournaments/${tournamentId}/competitions`, data).then(r => r.data),
  updateCompetition: (orgId: number | string, tournamentId: number, competitionId: number, data: any) =>
    api.patch<any>(`/org/${orgId}/tournaments/${tournamentId}/competitions/${competitionId}`, data).then(r => r.data),
  // Deactivation is a guarded removal — the server refuses it while any
  // registrations/participants/seeds/matches still reference the category.
  deactivateCompetition: (orgId: number | string, tournamentId: number, competitionId: number) =>
    api.delete<any>(`/org/${orgId}/tournaments/${tournamentId}/competitions/${competitionId}`).then(r => r.data),
};

// Group 5B-SR — bracket type configuration (Super Admin management + shared create form)
export const bracketTypeApi = {
  listActive: () => api.get('/bracket-types').then(r => r.data),
  listAll: () => api.get('/admin/bracket-types').then(r => r.data),
  setActive: (id: number, isActive: boolean) => api.put(`/admin/bracket-types/${id}`, { is_active: isActive }).then(r => r.data),
  getSportFormats: (sportId: number | string, bracketTypeId?: number | string) =>
    api.get(`/tournaments/sports/${sportId}/formats`, { params: bracketTypeId ? { bracket_type_id: bracketTypeId } : undefined }).then(r => r.data),
};

// ── G11.3 — tournament FULL refund request workflow ──
// Player: request + status on their OWN registration.

/** G11.8 — player SELF-SERVICE cancellation of their own registration. */
export const playerCancelRegistration = (registrationId: number, payload: { reason?: string } = {}) =>
  api.post(`/tournaments/registration/${registrationId}/cancel`, payload).then((r) => r.data);
export const tournamentRefundApi = {
  requestRefund: (regId: number, reason?: string) => api.post(`/tournaments/registrations/${regId}/refund-request`, { reason }).then(r => r.data),
  getMyRefundRequest: (regId: number) => api.get(`/tournaments/registrations/${regId}/refund-request`).then(r => r.data),
  // Organisation official (financial.reconcile): list / approve / reject.
  listOrgRequests: (orgId: number | string, status?: string) => api.get(`/org/${orgId}/tournaments/refund-requests`, { params: status ? { status } : undefined }).then(r => r.data),
  approve: (orgId: number | string, requestId: number) => api.post(`/org/${orgId}/tournaments/refund-requests/${requestId}/approve`).then(r => r.data),
  reject: (orgId: number | string, requestId: number, reason?: string) => api.post(`/org/${orgId}/tournaments/refund-requests/${requestId}/reject`, { reason }).then(r => r.data),
};

// ── Group 5 — Participant / Seeding / Draw foundation ──
export const tournamentParticipantApi = {
  getParticipants: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/participants`).then(r => r.data),
  assignSeed: (tournamentId: number, participantId: number, body: { seed_number: number; source: 'rating' | 'manual'; reason?: string }) =>
    api.post(`/admin/tournaments/${tournamentId}/participants/${participantId}/seed`, body).then(r => r.data),
  generateDraw: (tournamentId: number, drawSeed?: number) =>
    api.post(`/admin/tournaments/${tournamentId}/draw`, drawSeed ? { draw_seed: drawSeed } : {}).then(r => r.data),
  getCurrentDraw: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/draw`).then(r => r.data),
  listDraws: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/draws`).then(r => r.data),
  validateDraw: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/draw/validate`).then(r => r.data),
  moveParticipant: (tournamentId: number, participantId: number, position: number, override = false) =>
    api.post(`/admin/tournaments/${tournamentId}/draw/move`, { participant_id: participantId, position, override }).then(r => r.data),
  approveDraw: (tournamentId: number) => api.post(`/admin/tournaments/${tournamentId}/draw/approve`).then(r => r.data),
  lockDraw: (tournamentId: number) => api.post(`/admin/tournaments/${tournamentId}/draw/lock`).then(r => r.data),
  // Group 6 — participant lifecycle
  getWaitlist: (tournamentId: number, competitionId?: number | null) =>
    api.get(`/admin/tournaments/${tournamentId}/waitlist`, {
      params: competitionId != null ? { competition_id: competitionId } : undefined,
    }).then(r => r.data),
  withdrawParticipant: (tournamentId: number, participantId: number, reason?: string) =>
    api.post(`/admin/tournaments/${tournamentId}/participants/${participantId}/withdraw`, { reason }).then(r => r.data),
  // G11.20 — competition-scoped promotion (see the org variant for the rationale).
  promoteNextWaitlisted: (tournamentId: number, paymentMethod?: 'cash' | 'card', competitionId?: number | null) =>
    api.post(`/admin/tournaments/${tournamentId}/waitlist/promote`, {
      payment_method: paymentMethod,
      competition_id: competitionId ?? undefined,
    }).then(r => r.data),
  replaceParticipant: (tournamentId: number, withdrawnParticipantId: number, replacementParticipantId: number, paymentMethod?: 'cash' | 'card', competitionId?: number | null) =>
    api.post(`/admin/tournaments/${tournamentId}/participants/${withdrawnParticipantId}/replace`, {
      replacement_participant_id: replacementParticipantId,
      payment_method: paymentMethod,
      competition_id: competitionId ?? undefined,
    }).then(r => r.data),
  // Group 7 — pair/team participants, members & player replacement requests
  createPairParticipant: (tournamentId: number, data: { name?: string; member_user_ids: number[]; payment_method?: 'cash' | 'card' }) =>
    api.post(`/admin/tournaments/${tournamentId}/participants/pairs`, data).then(r => r.data),
  createTeamParticipant: (tournamentId: number, data: { name?: string; member_user_ids: number[]; payment_method?: 'cash' | 'card' }) =>
    api.post(`/admin/tournaments/${tournamentId}/participants/teams`, data).then(r => r.data),
  getParticipantMembers: (tournamentId: number, participantId: number) =>
    api.get(`/admin/tournaments/${tournamentId}/participants/${participantId}/members`).then(r => r.data),
  addParticipantMember: (tournamentId: number, participantId: number, userId: number) =>
    api.post(`/admin/tournaments/${tournamentId}/participants/${participantId}/members`, { user_id: userId }).then(r => r.data),
  removeParticipantMember: (tournamentId: number, participantId: number, userId: number) =>
    api.delete(`/admin/tournaments/${tournamentId}/participants/${participantId}/members`, { data: { user_id: userId } }).then(r => r.data),
  listReplacementRequests: (tournamentId: number, status?: string) =>
    api.get(`/admin/tournaments/${tournamentId}/replacement-requests`, { params: status ? { status } : undefined }).then(r => r.data),
  createReplacementRequest: (tournamentId: number, participantId: number, data: { outgoing_user_id: number; replacement_user_id: number; reason?: string }) =>
    api.post(`/admin/tournaments/${tournamentId}/participants/${participantId}/replacement-requests`, data).then(r => r.data),
  approveReplacementRequest: (tournamentId: number, requestId: number) =>
    api.post(`/admin/tournaments/${tournamentId}/replacement-requests/${requestId}/approve`).then(r => r.data),
  rejectReplacementRequest: (tournamentId: number, requestId: number, reason?: string) =>
    api.post(`/admin/tournaments/${tournamentId}/replacement-requests/${requestId}/reject`, { reason }).then(r => r.data),
  cancelReplacementRequest: (tournamentId: number, requestId: number) =>
    api.post(`/admin/tournaments/${tournamentId}/replacement-requests/${requestId}/cancel`).then(r => r.data),
  // Group 8 — match generation, scheduling & court reservation
  generateMatches: (tournamentId: number) =>
    api.post(`/admin/tournaments/${tournamentId}/matches/generate`).then(r => r.data),
  getEligibleCourts: (tournamentId: number) =>
    api.get(`/admin/tournaments/${tournamentId}/matches/eligible-courts`).then(r => r.data),
  scheduleMatch: (tournamentId: number, matchId: number, data: { date: string; start_time: string; end_time: string; resource_id: number }) =>
    api.post(`/admin/tournaments/${tournamentId}/matches/${matchId}/schedule`, data).then(r => r.data),
  autoSchedule: (tournamentId: number) =>
    api.post(`/admin/tournaments/${tournamentId}/matches/auto-schedule`).then(r => r.data),
  releaseMatchCourt: (tournamentId: number, matchId: number) =>
    api.post(`/admin/tournaments/${tournamentId}/matches/${matchId}/release-court`).then(r => r.data),
};

export const orgTournamentParticipantApi = {
  getParticipants: (orgId: number | string, tournamentId: number) => api.get(`/org/${orgId}/tournaments/${tournamentId}/participants`).then(r => r.data),
  assignSeed: (orgId: number | string, tournamentId: number, participantId: number, body: { seed_number: number; source: 'rating' | 'manual'; reason?: string }) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/participants/${participantId}/seed`, body).then(r => r.data),
  generateDraw: (orgId: number | string, tournamentId: number, drawSeed?: number) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/draw`, drawSeed ? { draw_seed: drawSeed } : {}).then(r => r.data),
  getCurrentDraw: (orgId: number | string, tournamentId: number) => api.get(`/org/${orgId}/tournaments/${tournamentId}/draw`).then(r => r.data),
  validateDraw: (orgId: number | string, tournamentId: number) => api.get(`/org/${orgId}/tournaments/${tournamentId}/draw/validate`).then(r => r.data),
  moveParticipant: (orgId: number | string, tournamentId: number, participantId: number, position: number, override = false) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/draw/move`, { participant_id: participantId, position, override }).then(r => r.data),
  approveDraw: (orgId: number | string, tournamentId: number) => api.post(`/org/${orgId}/tournaments/${tournamentId}/draw/approve`).then(r => r.data),
  lockDraw: (orgId: number | string, tournamentId: number) => api.post(`/org/${orgId}/tournaments/${tournamentId}/draw/lock`).then(r => r.data),
  // Group 6 — participant lifecycle (org)
  getWaitlist: (orgId: number | string, tournamentId: number, competitionId?: number | null) =>
    api.get(`/org/${orgId}/tournaments/${tournamentId}/waitlist`, {
      params: competitionId != null ? { competition_id: competitionId } : undefined,
    }).then(r => r.data),
  withdrawParticipant: (orgId: number | string, tournamentId: number, participantId: number, reason?: string) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/participants/${participantId}/withdraw`, { reason }).then(r => r.data),
  // G11.20 — `competitionId` scopes the FIFO head to ONE competition. Omit it
  // only for a single-competition tournament; the server rejects the ambiguous
  // case rather than filling an arbitrary category.
  promoteNextWaitlisted: (orgId: number | string, tournamentId: number, paymentMethod?: 'cash' | 'card', competitionId?: number | null) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/waitlist/promote`, {
      payment_method: paymentMethod,
      competition_id: competitionId ?? undefined,
    }).then(r => r.data),
  replaceParticipant: (orgId: number | string, tournamentId: number, withdrawnParticipantId: number, replacementParticipantId: number, paymentMethod?: 'cash' | 'card', competitionId?: number | null) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/participants/${withdrawnParticipantId}/replace`, {
      replacement_participant_id: replacementParticipantId,
      payment_method: paymentMethod,
      competition_id: competitionId ?? undefined,
    }).then(r => r.data),
  // Group 7 — pair/team participants, members & player replacement requests (org)
  createPairParticipant: (orgId: number | string, tournamentId: number, data: { name?: string; member_user_ids: number[]; payment_method?: 'cash' | 'card' }) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/participants/pairs`, data).then(r => r.data),
  createTeamParticipant: (orgId: number | string, tournamentId: number, data: { name?: string; member_user_ids: number[]; payment_method?: 'cash' | 'card' }) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/participants/teams`, data).then(r => r.data),
  getParticipantMembers: (orgId: number | string, tournamentId: number, participantId: number) =>
    api.get(`/org/${orgId}/tournaments/${tournamentId}/participants/${participantId}/members`).then(r => r.data),
  addParticipantMember: (orgId: number | string, tournamentId: number, participantId: number, userId: number) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/participants/${participantId}/members`, { user_id: userId }).then(r => r.data),
  removeParticipantMember: (orgId: number | string, tournamentId: number, participantId: number, userId: number) =>
    api.delete(`/org/${orgId}/tournaments/${tournamentId}/participants/${participantId}/members`, { data: { user_id: userId } }).then(r => r.data),
  listReplacementRequests: (orgId: number | string, tournamentId: number, status?: string) =>
    api.get(`/org/${orgId}/tournaments/${tournamentId}/replacement-requests`, { params: status ? { status } : undefined }).then(r => r.data),
  createReplacementRequest: (orgId: number | string, tournamentId: number, participantId: number, data: { outgoing_user_id: number; replacement_user_id: number; reason?: string }) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/participants/${participantId}/replacement-requests`, data).then(r => r.data),
  approveReplacementRequest: (orgId: number | string, tournamentId: number, requestId: number) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/replacement-requests/${requestId}/approve`).then(r => r.data),
  rejectReplacementRequest: (orgId: number | string, tournamentId: number, requestId: number, reason?: string) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/replacement-requests/${requestId}/reject`, { reason }).then(r => r.data),
  cancelReplacementRequest: (orgId: number | string, tournamentId: number, requestId: number) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/replacement-requests/${requestId}/cancel`).then(r => r.data),
  // Group 8 — match generation, scheduling & court reservation (org)
  generateMatches: (orgId: number | string, tournamentId: number) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/matches/generate`).then(r => r.data),
  getEligibleCourts: (orgId: number | string, tournamentId: number) =>
    api.get(`/org/${orgId}/tournaments/${tournamentId}/matches/eligible-courts`).then(r => r.data),
  scheduleMatch: (orgId: number | string, tournamentId: number, matchId: number, data: { date: string; start_time: string; end_time: string; resource_id: number }) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/matches/${matchId}/schedule`, data).then(r => r.data),
  autoSchedule: (orgId: number | string, tournamentId: number) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/matches/auto-schedule`).then(r => r.data),
  releaseMatchCourt: (orgId: number | string, tournamentId: number, matchId: number) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/matches/${matchId}/release-court`).then(r => r.data),
};
