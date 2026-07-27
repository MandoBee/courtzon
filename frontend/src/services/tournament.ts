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
  publicRegister: (tournamentId: number) => api.post(`/tournaments/${tournamentId}/register`).then(r => r.data),
};
