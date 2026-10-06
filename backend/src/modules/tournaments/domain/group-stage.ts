import { seededShuffle } from './tournament-aggregate.js';

/**
 * Step 3B-2 — pure Group Stage planning helpers (no I/O).
 *
 * Deterministic, validated distribution of tournament participants into exactly
 * `groupCount` groups of at most `participantsPerGroup` each. The Round Robin
 * pairing itself is delegated to the existing `generateRoundRobinMatches`.
 */

export interface GroupStageMemberInput {
  id: number;
}

/**
 * Plan the member count of every group.
 *
 * Constraints (validated, never silently corrected):
 *  - groupCount >= 1, participantsPerGroup >= 2
 *  - participantCount >= 2 and >= groupCount * 2 (every group needs a pair)
 *  - ceil(participantCount / groupCount) <= participantsPerGroup (no oversized group;
 *    the LAST group may be smaller — an established project convention)
 *
 * Balanced distribution (base or base+1) keeps groupCount groups all equal or
 * differing by at most one member.
 */
export function planGroupMemberCounts(
  participantCount: number,
  groupCount: number,
  participantsPerGroup: number,
): number[] {
  if (!Number.isInteger(groupCount) || groupCount < 1) {
    throw new Error('groupCount must be an integer >= 1');
  }
  if (!Number.isInteger(participantsPerGroup) || participantsPerGroup < 2) {
    throw new Error('participantsPerGroup must be an integer >= 2');
  }
  if (!Number.isInteger(participantCount) || participantCount < 2) {
    throw new Error('At least 2 participants are required for a group stage');
  }
  const max = Math.ceil(participantCount / groupCount);
  if (max > participantsPerGroup) {
    throw new Error(
      `Participant count (${participantCount}) exceeds group capacity (${groupCount} groups × ${participantsPerGroup} max)`,
    );
  }
  if (Math.floor(participantCount / groupCount) < 2) {
    throw new Error(
      `Participant count (${participantCount}) is too small for ${groupCount} groups — every group needs at least 2 participants`,
    );
  }
  const base = Math.floor(participantCount / groupCount);
  const remainder = participantCount % groupCount;
  return Array.from({ length: groupCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Deterministic group assignment: seeded shuffle then contiguous partition into
 * the planned group sizes. The SAME input set + seed always yields the SAME
 * membership; a different seed yields a different (still valid) assignment.
 */
export function assignGroupsDeterministic<T extends GroupStageMemberInput>(
  participants: T[],
  seed: number,
  sizes: number[],
): T[][] {
  const shuffled = seededShuffle(participants, seed);
  const groups: T[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    groups.push(shuffled.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups;
}