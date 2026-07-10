export interface WaitingListEntryData {
  id: number;
  matchId: number;
  userId: number;
  position: number;
  createdAt: Date;
}

export class WaitingListEntry {
  public readonly id: number;
  public readonly matchId: number;
  public readonly userId: number;
  private _position: number;
  public readonly createdAt: Date;

  constructor(data: WaitingListEntryData) {
    this.id = data.id;
    this.matchId = data.matchId;
    this.userId = data.userId;
    this._position = data.position;
    this.createdAt = data.createdAt;
  }

  get position(): number { return this._position; }

  setPosition(pos: number): void {
    this._position = pos;
  }
}
