import { describe, it, expect } from 'vitest';
import { toCsv, csvFilename } from './csv.js';

describe('toCsv', () => {
  it('writes a header row and escapes commas, quotes and newlines', () => {
    const csv = toCsv(
      ['Name', 'Note', 'Amount'],
      [
        ['Padel Edge', 'Club "main" branch', 98.4],
        ['Shop 5, Cairo', 'line1\nline2', '9.60'],
      ],
      false,
    );
    expect(csv).toBe(
      'Name,Note,Amount\r\n' +
      'Padel Edge,"Club ""main"" branch",98.4\r\n' +
      '"Shop 5, Cairo","line1\nline2",9.60',
    );
  });

  it('preserves decimal amounts as-is', () => {
    const csv = toCsv(['Amount'], [[98.4], ['9.60'], [0]], false);
    expect(csv).toBe('Amount\r\n98.4\r\n9.60\r\n0');
  });

  it('prepends a UTF-8 BOM by default', () => {
    const csv = toCsv(['A'], [[1]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('renders null/undefined cells as empty', () => {
    const csv = toCsv(['A', 'B'], [[null, undefined]], false);
    expect(csv).toBe('A,B\r\n,');
  });

  it('handles empty rows list (header only)', () => {
    const csv = toCsv(['A', 'B'], [], false);
    expect(csv).toBe('A,B');
  });
});

describe('csvFilename', () => {
  it('produces a dated stable filename', () => {
    expect(csvFilename('settlements', new Date(2026, 7, 26))).toBe('settlements_2026-08-26.csv');
    expect(csvFilename('general-ledger', new Date(2026, 0, 5))).toBe('general-ledger_2026-01-05.csv');
  });
});