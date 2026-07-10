export interface MatchCriteriaParams {
  minAge?: number | null;
  maxAge?: number | null;
  targetGender: 'male' | 'female' | 'any';
  targetLevelId?: number | null;
}

export class MatchCriteria {
  readonly minAge: number | null;
  readonly maxAge: number | null;
  readonly targetGender: 'male' | 'female' | 'any';
  readonly targetLevelId: number | null;

  constructor(params: MatchCriteriaParams) {
    this.minAge = params.minAge ?? null;
    this.maxAge = params.maxAge ?? null;
    this.targetGender = params.targetGender;
    this.targetLevelId = params.targetLevelId ?? null;
  }
}
