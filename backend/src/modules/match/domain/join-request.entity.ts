import type { JoinRequestStatus } from './match.types.js';
import { AppError } from '../../../shared/errors/app-error.js';

const VALID_TRANSITIONS: Record<JoinRequestStatus, JoinRequestStatus[]> = {
  submitted: ['withdrawn', 'approved', 'rejected', 'auto_rejected'],
  withdrawn: [],
  approved: [],
  rejected: [],
  auto_rejected: [],
};

export interface JoinRequestData {
  id: number;
  matchId: number;
  userId: number;
  status: JoinRequestStatus;
  submittedAt: Date;
  respondedAt: Date | null;
  responderId: number | null;
  rejectionReason: string | null;
}

export class JoinRequest {
  public readonly id: number;
  public readonly matchId: number;
  public readonly userId: number;
  private _status: JoinRequestStatus;
  public readonly submittedAt: Date;
  public respondedAt: Date | null;
  public responderId: number | null;
  public rejectionReason: string | null;

  constructor(data: JoinRequestData) {
    this.id = data.id;
    this.matchId = data.matchId;
    this.userId = data.userId;
    this._status = data.status;
    this.submittedAt = data.submittedAt;
    this.respondedAt = data.respondedAt;
    this.responderId = data.responderId;
    this.rejectionReason = data.rejectionReason;
  }

  get status(): JoinRequestStatus { return this._status; }

  approve(responderId: number): void {
    this.transitionTo('approved');
    this.respondedAt = new Date();
    this.responderId = responderId;
  }

  reject(responderId: number, reason?: string): void {
    this.transitionTo('rejected');
    this.respondedAt = new Date();
    this.responderId = responderId;
    this.rejectionReason = reason ?? null;
  }

  withdraw(): void {
    this.transitionTo('withdrawn');
    this.respondedAt = new Date();
  }

  autoReject(): void {
    this.transitionTo('auto_rejected');
    this.respondedAt = new Date();
  }

  private transitionTo(to: JoinRequestStatus): void {
    const allowed = VALID_TRANSITIONS[this._status];
    if (!allowed || !allowed.includes(to)) {
      throw new AppError(
        `Cannot transition join request ${this.id} from '${this._status}' to '${to}'`,
        409, 'INVALID_JOIN_REQUEST_STATUS'
      );
    }
    this._status = to;
  }
}
