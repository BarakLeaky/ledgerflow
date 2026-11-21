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
