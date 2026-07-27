import api from './api';
import type { PaginatedResult } from '../types/api';

export const leagueApi = {
  // Dashboard
  getDashboard: () => api.get('/admin/leagues/dashboard').then(r => r.data),

  // Seasons
  getSeasons: (params?: Record<string, any>) =>
    api.get<PaginatedResult<any>>('/admin/seasons', { params }).then(r => r.data),
  getSeason: (id: number) => api.get<any>(`/admin/seasons/${id}`).then(r => r.data),
  createSeason: (data: any) => api.post<any>('/admin/seasons', data).then(r => r.data),
  updateSeason: (id: number, data: any) => api.put<any>(`/admin/seasons/${id}`, data).then(r => r.data),
  publishSeason: (id: number) => api.post(`/admin/seasons/${id}/publish`).then(r => r.data),
  archiveSeason: (id: number) => api.post(`/admin/seasons/${id}/archive`).then(r => r.data),

  // Leagues
  getLeagues: (params?: Record<string, any>) =>
    api.get<PaginatedResult<any>>('/admin/leagues', { params }).then(r => r.data),
  getLeague: (id: number) => api.get<any>(`/admin/leagues/${id}`).then(r => r.data),
  createLeague: (data: any) => api.post<any>('/admin/leagues', data).then(r => r.data),
  updateLeague: (id: number, data: any) => api.put<any>(`/admin/leagues/${id}`, data).then(r => r.data),
  publishLeague: (id: number) => api.post(`/admin/leagues/${id}/publish`).then(r => r.data),
  openRegistration: (id: number) => api.post(`/admin/leagues/${id}/open-reg`).then(r => r.data),
  closeRegistration: (id: number) => api.post(`/admin/leagues/${id}/close-reg`).then(r => r.data),
  startLeague: (id: number) => api.post(`/admin/leagues/${id}/start`).then(r => r.data),
  completeLeague: (id: number) => api.post(`/admin/leagues/${id}/complete`).then(r => r.data),
  cancelLeague: (id: number) => api.post(`/admin/leagues/${id}/cancel`).then(r => r.data),
  archiveLeague: (id: number) => api.post(`/admin/leagues/${id}/archive`).then(r => r.data),

  // Divisions
  getDivisions: (leagueId: number) => api.get(`/admin/leagues/${leagueId}/divisions`).then(r => r.data),
  createDivision: (leagueId: number, data: any) => api.post(`/admin/leagues/${leagueId}/divisions`, data).then(r => r.data),
  updateDivision: (id: number, data: any) => api.put(`/admin/divisions/${id}`, data).then(r => r.data),
  promote: (divisionId: number, count: number) => api.post(`/admin/divisions/${divisionId}/promote`, { count }).then(r => r.data),
  relegate: (divisionId: number, count: number) => api.post(`/admin/divisions/${divisionId}/relegate`, { count }).then(r => r.data),

  // Teams
  getTeams: (leagueId: number) => api.get(`/admin/leagues/${leagueId}/teams`).then(r => r.data),
  registerTeam: (leagueId: number, data: any) => api.post(`/admin/leagues/${leagueId}/register`, data).then(r => r.data),
  cancelTeam: (teamId: number) => api.post(`/admin/leagues/teams/${teamId}/cancel`).then(r => r.data),
  confirmTeam: (teamId: number) => api.post(`/admin/leagues/teams/${teamId}/confirm`).then(r => r.data),

  // Fixtures
  generateFixtures: (leagueId: number) => api.post(`/admin/leagues/${leagueId}/generate-fixtures`).then(r => r.data),
  getMatches: (leagueId: number) => api.get(`/admin/leagues/${leagueId}/matches`).then(r => r.data),
  assignCourt: (matchId: number, resourceId: number) =>
    api.put(`/admin/leagues/matches/${matchId}/court`, { resource_id: resourceId }).then(r => r.data),
  assignReferee: (matchId: number, refereeId: number) =>
    api.put(`/admin/leagues/matches/${matchId}/referee`, { referee_id: refereeId }).then(r => r.data),
  recordResult: (matchId: number, data: any) =>
    api.post(`/admin/leagues/matches/${matchId}/result`, data).then(r => r.data),

  // Standings
  getStandings: (leagueId: number) => api.get(`/admin/leagues/${leagueId}/standings`).then(r => r.data),
  recalculateStandings: (leagueId: number) => api.post(`/admin/leagues/${leagueId}/recalculate-standings`).then(r => r.data),

  // Statistics
  getStatistics: (leagueId: number) => api.get(`/admin/leagues/${leagueId}/statistics`).then(r => r.data),
  recalculateStats: (leagueId: number) => api.post(`/admin/leagues/${leagueId}/recalculate-stats`).then(r => r.data),
};
