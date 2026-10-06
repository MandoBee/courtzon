/**
 * Step 3B-4 — GSK → Knockout deterministic seeding.
 *
 * Produces the ORDERED qualified participant list that the EXISTING
 * `generateKnockoutBracket` consumes (it pairs consecutive positions, so this
 * ordering IS the first-round bracket slots 0..Q-1; the engine pads to the next
 * power of two with explicit tail byes).
 *
 * Constraints (all deterministic, bounded, never random):
 *  - separateGroupWinners: no first-round pair contains two group winners.
 *  - preventSameGroupRematch: every first-round pair holds different groups.
 *  - unsatisfiable constraints are REJECTED, never silently relaxed.
 */

export interface GskSeedInput {
  participantId: number;
  groupId: number;
  /** 1 = group winner, 2 = runner-up, ... */
  groupRank: number;
  /** 'group_position' | 'best_third' */
  qualificationType: 'group_position' | 'best_third';
  seed?: number | null;
}

export interface GskSeedingOptions {
  separateGroupWinners: boolean;
  preventSameGroupRematch: boolean;
}

const isWinner = (i: GskSeedInput) => i.qualificationType === 'group_position' && i.groupRank === 1;

/** Stable deterministic comparator for the initial input ordering. */
function stableInputOrder(a: GskSeedInput, b: GskSeedInput): number {
  // Winners first (by group), then others by seed then participant id.
  const aWin = isWinner(a) ? 0 : 1;
  const bWin = isWinner(b) ? 0 : 1;
  if (aWin !== bWin) return aWin - bWin;
  if (aWin === 0) return a.groupId - b.groupId || (a.seed ?? 0) - (b.seed ?? 0) || a.participantId - b.participantId;
  return (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER) || a.groupId - b.groupId || a.participantId - b.participantId;
}

/**
 * Deterministic constraint-aware bracket assignment.
 *
 * Returns participantIds ordered into first-round slots. Greedy least-loaded
 * pair selection (smallest pair index among ties) — bounded O(Q × pairs), no
 * random retry. Throws when no valid assignment exists.
 */
export function assignKnockoutSeeding(inputs: GskSeedInput[], opts: GskSeedingOptions): number[] {
  const ordered = [...inputs].sort(stableInputOrder);
  const pairCount = Math.ceil(ordered.length / 2);
  // pairs[i] = [slot0Item|null, slot1Item|null]
  const pairs: Array<[GskSeedInput | null, GskSeedInput | null]> = Array.from({ length: pairCount }, () => [null, null]);

  if (opts.separateGroupWinners) {
    const winnerCount = ordered.filter(isWinner).length;
    if (winnerCount > pairCount) {
      throw new Error('separateGroupWinners cannot be satisfied — more group winners than first-round matches');
    }
  }

  for (const item of ordered) {
    let placed = false;
    for (let p = 0; p < pairCount && !placed; p++) {
      const pair = pairs[p];
      const partner0 = pair[0];
      const partner1 = pair[1];
      if (partner0 != null && partner1 != null) continue; // pair full
      // Constraint: at most one winner per pair (separation).
      if (opts.separateGroupWinners && isWinner(item)) {
        if ((partner0 != null && isWinner(partner0)) || (partner1 != null && isWinner(partner1))) continue;
      }
      // Constraint: no same-group members in one pair (rematch prevention).
      if (opts.preventSameGroupRematch) {
        if ((partner0 != null && partner0.groupId === item.groupId) || (partner1 != null && partner1.groupId === item.groupId)) continue;
      }
      // Place into the first free slot of this (least-loaded, stable) pair.
      if (partner0 == null) pair[0] = item; else pair[1] = item;
      placed = true;
    }
    if (!placed) {
      throw new Error('Cannot build a valid knockout bracket satisfying the group constraints — configuration is impossible');
    }
  }

  // Flatten pair slots into first-round slot order.
  const order: number[] = [];
  // Prefer slot 0 (the even side), then slot 1 — mirrors the engine's pairing.
  const slot0: number[] = [];
  const slot1: number[] = [];
  for (const pair of pairs) {
    slot0.push(pair[0]?.participantId ?? -1);
    slot1.push(pair[1]?.participantId ?? -1);
  }
  for (let p = 0; p < pairCount; p++) {
    if (slot0[p] !== -1) order.push(slot0[p]);
    if (slot1[p] !== -1) order.push(slot1[p]);
  }
  return order;
}

/**
 * Validate an explicit ordering (manual seed mode) against the same
 * constraints. Throws when a first-round pair violates them.
 */
export function validateKnockoutPairing(order: number[], byParticipant: Map<number, GskSeedInput>, opts: GskSeedingOptions): void {
  for (let i = 0; i + 1 < order.length; i += 2) {
    const a = byParticipant.get(order[i]);
    const b = byParticipant.get(order[i + 1]);
    if (!a || !b) continue; // a real participant vs a bye/next-slot pair — engine handles byes
    if (opts.separateGroupWinners && isWinner(a) && isWinner(b)) {
      throw new Error('Manual seeding violates separateGroupWinners — two group winners meet in the first round');
    }
    if (opts.preventSameGroupRematch && a.groupId === b.groupId) {
      throw new Error('Manual seeding violates preventSameGroupRematch — same-group participants meet in the first round');
    }
  }
}