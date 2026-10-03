/**
 * The API always deals in integer minor units (e.g. kobo for NGN) — never
 * a decimal amount — matching the backend's accounting convention (see
 * docs/ARCHITECTURE.md). These two functions are the only place the
 * frontend converts between that and the decimal amount a human types or
 * reads. Assumes 2-decimal-place currencies (NGN, KES, GHS, USD), the same
 * assumption the backend's migration makes — not valid for a zero-decimal
 * currency like JPY, which is out of scope for this project's Nigeria-first
 * roadmap.
 */
export function toMinorUnits(decimalAmount: number): number {
  return Math.round(decimalAmount * 100);
}

export function formatMinorUnits(minorAmount: number, currency: string): string {
  const major = minorAmount / 100;
  return `${currency} ${major.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
