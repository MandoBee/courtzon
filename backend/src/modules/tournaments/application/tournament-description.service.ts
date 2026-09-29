/**
 * G11-Tournament Phase 2 — Automatic Tournament Description Composer.
 *
 * Pure + deterministic: identical input always produces identical output.
 * Builds a single-locale (application-default) plain-text description from
 * VERIFIED stored/derived tournament data. Never invents values, never assigns
 * monetary value to IN-KIND items, never duplicates the Rules snapshot (which
 * stays the separately-managed `tournaments.rules` text), and never includes
 * sponsor/prize amounts on any surface (keeps the composed description safe to
 * display on public/player detail pages).
 */

export interface ComposerPrize {
  placement?: number | null;
  type: string; // prize_type from tournament_prizes
  description?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
}

export interface ComposerSponsor {
  name: string;
  type: 'cash' | 'inkind';
  description?: string | null;
  amount?: number | null;
}

export interface TournamentDescriptionInput {
  name?: string | null;
  sport?: string | null;
  bracketType?: string | null;
  format?: string | null;
  matchFormat?: string | null;
  matchFormatType?: 'singles' | 'doubles' | 'team' | null;
  gender?: string[] | null;
  ageLabel?: string | null;
  levelLabel?: string | null;
  category?: string | null;
  season?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  venueName?: string | null;
  entryFee?: number | null;
  isFree?: boolean;
  currency?: string | null;
  minParticipants?: number | null;
  maxParticipants?: number | null;
  maxTeams?: number | null;
  prizes?: ComposerPrize[] | null;
  sponsors?: ComposerSponsor[] | null;
}

const PRIZE_TYPE_LABELS: Record<string, string> = {
  cash: 'Cash',
  gold: 'Gold Medal',
  silver: 'Silver Medal',
  bronze: 'Bronze Medal',
  trophy: 'Trophy',
  gift: 'Gift',
  other: 'Other',
};

const GENDER_LABELS: Record<string, string> = {
  male: 'Men',
  female: 'Women',
  mixed: 'Mixed',
};

const singular = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function placementLabel(placement: number): string {
  if (placement === 1) return '1st';
  if (placement === 2) return '2nd';
  if (placement === 3) return '3rd';
  return `${placement}th`;
}

function money(v: number, currency?: string | null): string {
  return `${v.toFixed(2)}${currency ? ` ${currency}` : ''}`;
}

export function composeTournamentDescription(input: TournamentDescriptionInput): string {
  const parts: string[] = [];

  if (input.name?.trim()) parts.push(input.name.trim());

  // Sport & Format
  const formatBits: string[] = [];
  if (input.sport?.trim()) formatBits.push(input.sport.trim());
  if (input.matchFormatType) formatBits.push(singular(input.matchFormatType));
  if (input.matchFormat?.trim()) formatBits.push(input.matchFormat.trim());
  if (input.bracketType?.trim()) formatBits.push(input.bracketType.trim());
  if (formatBits.length) parts.push(`Format: ${formatBits.join(' · ')}`);

  // Eligibility (gender / age / level)
  const elig: string[] = [];
  if (input.gender?.length) elig.push(input.gender.map((g) => GENDER_LABELS[g] ?? singular(g)).join(' / '));
  if (input.ageLabel?.trim()) elig.push(input.ageLabel.trim());
  if (input.levelLabel?.trim()) elig.push(input.levelLabel.trim());
  if (elig.length) parts.push(`Category: ${elig.join(' · ')}`);

  // Classification (category / season)
  const cls: string[] = [];
  if (input.category?.trim()) cls.push(input.category.trim());
  if (input.season?.trim()) cls.push(input.season.trim());
  if (cls.length) parts.push(`Classification: ${cls.join(' · ')}`);

  // Schedule
  if (input.startDate) {
    const dates = input.endDate && input.endDate !== input.startDate ? `${input.startDate} to ${input.endDate}` : input.startDate;
    parts.push(`Dates: ${dates}`);
  }
  if (input.venueName?.trim()) parts.push(`Venue: ${input.venueName.trim()}`);

  // Fees
  if (input.entryFee != null && input.entryFee > 0) {
    parts.push(`Fees: Entry fee ${money(input.entryFee, input.currency)}`);
  } else if (input.isFree) {
    parts.push('Fees: Free entry');
  }

  // Participants / teams
  const limits: string[] = [];
  if (input.minParticipants != null || input.maxParticipants != null) {
    const lo = input.minParticipants ?? input.maxParticipants;
    const hi = input.maxParticipants ?? input.minParticipants;
    limits.push(lo === hi ? `${lo} participants` : `${lo}-${hi} participants`);
  }
  if (input.maxTeams != null && input.maxTeams > 0) {
    limits.push(`up to ${input.maxTeams} teams`);
  }
  if (limits.length) parts.push(`Participants: ${limits.join(' · ')}`);

  // Prizes (placements + type + description; NO amounts)
  if (input.prizes?.length) {
    const lines = input.prizes
      .filter((p) => p.type)
      .map((p) => {
        const when = p.placement != null ? `${placementLabel(p.placement)} place` : 'Special';
        const what = PRIZE_TYPE_LABELS[p.type] ?? singular(p.type);
        const extra = p.type !== 'cash' && p.description?.trim() ? ` — ${p.description.trim()}` : '';
        return `  - ${when}: ${what}${extra}`;
      });
    if (lines.length) parts.push('Prizes:\n' + lines.join('\n'));
  }

  // Sponsors (names + type; IN-KIND description; NO amounts)
  if (input.sponsors?.length) {
    const lines = input.sponsors
      .map((s) => {
        const type = s.type === 'cash' ? 'Cash' : 'In-kind';
        const extra = s.type === 'inkind' && s.description?.trim() ? ` — ${s.description.trim()}` : '';
        return `  - ${s.name.trim()} (${type})${extra}`;
      });
    if (lines.length) parts.push('Sponsors:\n' + lines.join('\n'));
  }

  return parts.join('\n');
}