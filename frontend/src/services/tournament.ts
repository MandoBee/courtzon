import api from './api';
import type { PaginatedResult } from '../types/api';

export const tournamentApi = {
  // Admin
  getDashboard: () => api.get('/admin/tournaments/dashboard').then(r => r.data),
  getTournaments: (params?: Record<string, any>) =>
    api.get<PaginatedResult<any>>('/admin/tournaments', { params }).then(r => r.data),
  getTournament: (id: number) => api.get<any>(`/admin/tournaments/${id}`).then(r => r.data),
  createTournament: (data: any) => api.post<any>('/admin/tournaments', data).then(r => r.data),
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
  generateFixtures: (tournamentId: number) =>
    api.post(`/admin/tournaments/${tournamentId}/generate-fixtures`).then(r => r.data),
  generateBracket: (tournamentId: number) =>
    api.post(`/admin/tournaments/${tournamentId}/generate-bracket`).then(r => r.data),

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
  publicRegister: (tournamentId: number, paymentMethod?: 'cash' | 'card') =>
    api.post(`/tournaments/${tournamentId}/register`, { payment_method: paymentMethod }).then(r => r.data),
};

// Organisation-scoped tournament API — mirrors the admin workbench methods but
// routes through the tenant-scoped `/org/:orgId/tournaments` endpoints. Both
// contexts share the same authoritative tournamentService on the backend.
export const orgTournamentApi = {
  getTournaments: (orgId: number | string, params?: Record<string, any>) =>
    api.get<PaginatedResult<any>>(`/org/${orgId}/tournaments`, { params }).then(r => r.data),
  getTournament: (orgId: number | string, id: number) => api.get<any>(`/org/${orgId}/tournaments/${id}`).then(r => r.data),
  createTournament: (orgId: number | string, data: any) => api.post<any>(`/org/${orgId}/tournaments`, data).then(r => r.data),
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
  generateFixtures: (orgId: number | string, tournamentId: number) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/generate-fixtures`).then(r => r.data),
  generateBracket: (orgId: number | string, tournamentId: number) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/generate-bracket`).then(r => r.data),
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
};

// Group 5B-SR — bracket type configuration (Super Admin management + shared create form)
export const bracketTypeApi = {
  listActive: () => api.get('/bracket-types').then(r => r.data),
  listAll: () => api.get('/admin/bracket-types').then(r => r.data),
  setActive: (id: number, isActive: boolean) => api.put(`/admin/bracket-types/${id}`, { is_active: isActive }).then(r => r.data),
  getSportFormats: (sportId: number | string, bracketTypeId?: number | string) =>
    api.get(`/tournaments/sports/${sportId}/formats`, { params: bracketTypeId ? { bracket_type_id: bracketTypeId } : undefined }).then(r => r.data),
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
  getWaitlist: (tournamentId: number) => api.get(`/admin/tournaments/${tournamentId}/waitlist`).then(r => r.data),
  withdrawParticipant: (tournamentId: number, participantId: number, reason?: string) =>
    api.post(`/admin/tournaments/${tournamentId}/participants/${participantId}/withdraw`, { reason }).then(r => r.data),
  promoteNextWaitlisted: (tournamentId: number, paymentMethod?: 'cash' | 'card') =>
    api.post(`/admin/tournaments/${tournamentId}/waitlist/promote`, paymentMethod ? { payment_method: paymentMethod } : {}).then(r => r.data),
  replaceParticipant: (tournamentId: number, withdrawnParticipantId: number, replacementParticipantId: number, paymentMethod?: 'cash' | 'card') =>
    api.post(`/admin/tournaments/${tournamentId}/participants/${withdrawnParticipantId}/replace`, { replacement_participant_id: replacementParticipantId, payment_method: paymentMethod }).then(r => r.data),
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
  getWaitlist: (orgId: number | string, tournamentId: number) => api.get(`/org/${orgId}/tournaments/${tournamentId}/waitlist`).then(r => r.data),
  withdrawParticipant: (orgId: number | string, tournamentId: number, participantId: number, reason?: string) =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/participants/${participantId}/withdraw`, { reason }).then(r => r.data),
  promoteNextWaitlisted: (orgId: number | string, tournamentId: number, paymentMethod?: 'cash' | 'card') =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/waitlist/promote`, paymentMethod ? { payment_method: paymentMethod } : {}).then(r => r.data),
  replaceParticipant: (orgId: number | string, tournamentId: number, withdrawnParticipantId: number, replacementParticipantId: number, paymentMethod?: 'cash' | 'card') =>
    api.post(`/org/${orgId}/tournaments/${tournamentId}/participants/${withdrawnParticipantId}/replace`, { replacement_participant_id: replacementParticipantId, payment_method: paymentMethod }).then(r => r.data),
};
