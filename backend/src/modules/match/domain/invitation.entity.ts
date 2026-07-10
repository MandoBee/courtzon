import type { InvitationStatus } from './match.types.js';
import { AppError } from '../../../shared/errors/app-error.js';

const VALID_TRANSITIONS: Record<InvitationStatus, InvitationStatus[]> = {
  sent: ['read', 'declined', 'expired'],
  read: ['declined', 'expired'],
  declined: [],
  expired: [],
};

export interface InvitationData {
  id: number;
  matchId: number;
  userId: number;
  status: InvitationStatus;
  sentAt: Date;
  readAt: Date | null;
  respondedAt: Date | null;
  expiresAt: Date | null;
}

export class Invitation {
  public readonly id: number;
  public readonly matchId: number;
  public readonly userId: number;
  private _status: InvitationStatus;
  public readonly sentAt: Date;
  public readAt: Date | null;
  public respondedAt: Date | null;
  public readonly expiresAt: Date | null;

  constructor(data: InvitationData) {
    this.id = data.id;
    this.matchId = data.matchId;
    this.userId = data.userId;
    this._status = data.status;
    this.sentAt = data.sentAt;
    this.readAt = data.readAt;
    this.respondedAt = data.respondedAt;
    this.expiresAt = data.expiresAt;
  }

  get status(): InvitationStatus { return this._status; }

  markRead(): void {
    this.transitionTo('read');
    this.readAt = new Date();
  }

  decline(): void {
    this.transitionTo('declined');
    this.respondedAt = new Date();
  }

  expire(): void {
    this.transitionTo('expired');
    this.respondedAt = new Date();
  }

  private transitionTo(to: InvitationStatus): void {
    const allowed = VALID_TRANSITIONS[this._status];
    if (!allowed || !allowed.includes(to)) {
      throw new AppError(
        `Cannot transition invitation ${this.id} from '${this._status}' to '${to}'`,
        409, 'INVALID_INVITATION_STATUS'
      );
    }
    this._status = to;
  }
}
