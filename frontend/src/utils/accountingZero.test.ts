import { describe, it, expect } from 'vitest';
import { isEffectivelyZero, filterZeroBalanceRows } from './accountingZero';

describe('isEffectivelyZero', () => {
  it('treats numeric zero and equivalent representations as zero', () => {
    expect(isEffectivelyZero(0)).toBe(true);
    expect(isEffectivelyZero('0')).toBe(true);
    expect(isEffectivelyZero('0.00')).toBe(true);
    expect(isEffectivelyZero('0.000')).toBe(true);
    expect(isEffectivelyZero(0.0)).toBe(true);
    expect(isEffectivelyZero(-0)).toBe(true);
  });

  it('treats null, undefined and empty string as zero (they display as 0.00)', () => {
    expect(isEffectivelyZero(null)).toBe(true);
    expect(isEffectivelyZero(undefined)).toBe(true);
    expect(isEffectivelyZero('')).toBe(true);
  });

  it('treats non-zero numbers and numeric strings as non-zero', () => {
    expect(isEffectivelyZero(1)).toBe(false);
    expect(isEffectivelyZero(-1)).toBe(false);
    expect(isEffectivelyZero(0.01)).toBe(false);
    expect(isEffectivelyZero('123')).toBe(false);
    expect(isEffectivelyZero('-0.5')).toBe(false);
    expect(isEffectivelyZero(500)).toBe(false);
  });

  it('treats unparseable values as zero (they render as a zero amount)', () => {
    expect(isEffectivelyZero(NaN)).toBe(true);
    expect(isEffectivelyZero('abc')).toBe(true);
  });
});

describe('filterZeroBalanceRows', () => {
  const rows = [
    { account_id: 1, balance: 0 },
    { account_id: 2, balance: '0' },
    { account_id: 3, balance: '0.00' },
    { account_id: 4, balance: 150 },
    { account_id: 5, balance: '-25.5' },
    { account_id: 6, balance: null },
    { account_id: 7, balance: 0.01 },
  ];

  it('hides zero-balance rows when toggle is OFF (default)', () => {
    const result = filterZeroBalanceRows(rows, false);
    const ids = result.map((r) => r.account_id);
    expect(ids).toEqual([4, 5, 7]);
  });

  it('shows all rows when toggle is ON', () => {
    const result = filterZeroBalanceRows(rows, true);
    expect(result).toHaveLength(rows.length);
  });

  it('never hides non-zero rows regardless of toggle', () => {
    const off = filterZeroBalanceRows(rows, false);
    const on = filterZeroBalanceRows(rows, true);
    expect(off.map((r) => r.account_id)).toContain(4);
    expect(off.map((r) => r.account_id)).toContain(5);
    expect(off.map((r) => r.account_id)).toContain(7);
    expect(on.map((r) => r.account_id)).toContain(4);
  });

  it('preserves original row order and object references', () => {
    const result = filterZeroBalanceRows(rows, false);
    expect(result[0]).toBe(rows[3]);
    expect(result[1]).toBe(rows[4]);
    expect(result[2]).toBe(rows[6]);
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    filterZeroBalanceRows(rows, false);
    expect(rows).toHaveLength(copy.length);
  });

  it('handles empty / all-zero datasets gracefully', () => {
    expect(filterZeroBalanceRows([], false)).toEqual([]);
    expect(filterZeroBalanceRows([], true)).toEqual([]);
    const allZero = [{ account_id: 1, balance: 0 }, { account_id: 2, balance: '0.00' }];
    expect(filterZeroBalanceRows(allZero, false)).toEqual([]);
    expect(filterZeroBalanceRows(allZero, true)).toHaveLength(2);
  });
});
