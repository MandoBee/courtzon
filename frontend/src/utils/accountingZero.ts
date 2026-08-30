export function isEffectivelyZero(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  const n = Number(value);
  return Number.isNaN(n) ? true : n === 0;
}

export function filterZeroBalanceRows<T extends { balance?: unknown }>(rows: T[], showZeroBalances: boolean): T[] {
  if (showZeroBalances) return rows;
  return rows.filter((r) => !isEffectivelyZero(r.balance));
}
