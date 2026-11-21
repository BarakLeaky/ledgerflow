// Amounts are integer minor units (bigint-as-string). Supported currencies all have 2 decimals.
export const CURRENCIES = ["KES", "USD", "EUR", "GBP", "TZS"] as const;

export function formatMinor(minor: string, currency: string): string {
  const n = BigInt(minor);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = new Intl.NumberFormat("en-KE").format(abs / 100n);
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${currency} ${whole}.${frac}`;
}

/** "1500.5" -> 150050n. Returns null for anything that is not a plain amount with up to 2 decimals. */
export function parseMinor(input: string): bigint | null {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(input.trim());
  return m ? BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0") : null;
}
