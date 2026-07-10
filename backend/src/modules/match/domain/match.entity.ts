import type { MatchType, MatchStatus, Visibility } from './match.types.js';
import type { MatchCriteria } from './match-criteria.vo.js';
import type { MatchSession } from './match-session.vo.js';
import { Invitation } from './invitation.entity.js';
import { JoinRequest } from './join-request.entity.js';
import { Participant } from './participant.entity.js';
import { WaitingListEntry } from './waiting-list-entry.entity.js';
import { AppError } from '../../../shared/errors/app-error.js';

const VALID_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  open: ['full', 'closed', 'cancelled', 'void'],
  full: ['open', 'closed', 'cancelled', 'void'],
  closed: ['in_progress', 'cancelled', 'void'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  void: [],
};

export interface MatchData {
  id: number;
  type: MatchType;
  status: MatchStatus;
  bookingId: number | null;
  sportId: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Match {
  public readonly id: number;
  public readonly type: MatchType;
  private _status: MatchStatus;
  public readonly bookingId: number | null;
  public readonly sportId: number;
  private _version: number;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private _invitations: Invitation[] = [];
  private _joinRequests: JoinRequest[] = [];
  private _participants: Participant[] = [];
  private _waitingList: WaitingListEntry[] = [];
  private _session: MatchSession | null = null;

  constructor(data: MatchData) {
    this.id = data.id;
    this.type = data.type;
    this._status = data.status;
    this.bookingId = data.bookingId;
    this.sportId = data.sportId;
    this._version = data.version;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  get status(): MatchStatus { return this._status; }
  get version(): number { return this._version; }
  get invitations(): ReadonlyArray<Invitation> { return this._invitations; }
  get joinRequests(): ReadonlyArray<JoinRequest> { return this._joinRequests; }
  get participants(): ReadonlyArray<Participant> { return this._participants; }
  get waitingList(): ReadonlyArray<WaitingListEntry> { return this._waitingList; }
  get session(): MatchSession | null { return this._session; }

  get participantCount(): number {
    return this._participants.length;
  }

  transition(to: MatchStatus): void {
    const allowed = VALID_TRANSITIONS[this._status];
    if (!allowed || !allowed.includes(to)) {
      throw new AppError(
        `Cannot transition match ${this.id} from '${this._status}' to '${to}'`,
        409, 'INVALID_MATCH_STATUS'
      );
    }
    this._status = to;
    this.updatedAt = new Date();
  }

  incrementVersion(): void {
    this._version++;
  }

  setInvitations(invitations: Invitation[]): void {
    this._invitations = invitations;
  }

  setJoinRequests(requests: JoinRequest[]): void {
    this._joinRequests = requests;
  }

  setParticipants(participants: Participant[]): void {
    this._participants = participants;
  }

  setWaitingList(entries: WaitingListEntry[]): void {
    this._waitingList = entries;
  }

  setSession(session: MatchSession | null): void {
    this._session = session;
  }

  addInvitation(invitation: Invitation): void {
    const exists = this._invitations.some(
      (i) => i.userId === invitation.userId
    );
    if (exists) {
      throw new AppError('Player already invited', 409, 'DUPLICATE_INVITATION');
    }
    this._invitations.push(invitation);
  }

  addJoinRequest(request: JoinRequest): void {
    const exists = this._joinRequests.some(
      (r) => r.userId === request.userId && r.status !== 'withdrawn'
    );
    if (exists) {
      throw new AppError('Player already has an active join request', 409, 'DUPLICATE_JOIN_REQUEST');
    }
    this._joinRequests.push(request);
  }

  addParticipant(participant: Participant): void {
    const exists = this._participants.some(
      (p) => p.userId === participant.userId
    );
    if (exists) {
      throw new AppError('Player is already a participant', 409, 'DUPLICATE_PARTICIPANT');
    }
    this._participants.push(participant);
  }

  removeParticipant(userId: number): Participant | null {
    const idx = this._participants.findIndex((p) => p.userId === userId);
    if (idx === -1) return null;
    const removed = this._participants[idx];
    this._participants.splice(idx, 1);
    return removed;
  }

  addToWaitingList(entry: WaitingListEntry): void {
    const exists = this._waitingList.some(
      (w) => w.userId === entry.userId
    );
    if (exists) {
      throw new AppError('Player is already on the waiting list', 409, 'DUPLICATE_WAITING_LIST');
    }
    this._waitingList.push(entry);
  }

  removeFromWaitingList(userId: number): WaitingListEntry | null {
    const idx = this._waitingList.findIndex((w) => w.userId === userId);
    if (idx === -1) return null;
    const removed = this._waitingList[idx];
    this._waitingList.splice(idx, 1);
    return removed;
  }
}
