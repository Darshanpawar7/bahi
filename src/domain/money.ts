import type { BasisPoints, CurrencyCode, Paise } from './types';

const QUANTITY_SCALE = 1000n; // quantities carry at most three decimals
const BP_SCALE = 10_000n;

/** Integer division that rounds half up, for non-negative numerators. */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

/** Converts a typed quantity such as 2.5 into thousandths, so 2.5 becomes 2500. */
export function toMilliUnits(quantity: number): bigint {
  if (!Number.isFinite(quantity) || quantity < 0) return 0n;
  return BigInt(Math.round(quantity * Number(QUANTITY_SCALE)));
}

/**
 * quantity x rate, rounded half up to the paisa. The multiplication is done on integers,
 * so 3 x 33.33 is exactly 99.99 and never 99.99000000000001.
 */
export function lineAmount(quantity: number, ratePaise: Paise): Paise {
  const rate = BigInt(Math.max(0, Math.round(ratePaise)));
  return Number(divideHalfUp(toMilliUnits(quantity) * rate, QUANTITY_SCALE));
}

/** amount x numerator / denominator, rounded half up, on integers. */
export function portion(amount: Paise, numerator: number, denominator: number): Paise {
  if (amount <= 0 || numerator <= 0 || denominator <= 0) return 0;
  return Number(
    divideHalfUp(BigInt(Math.round(amount)) * BigInt(Math.round(numerator)), BigInt(Math.round(denominator))),
  );
}

/** A share of an amount given in basis points, rounded half up. 1800 bp of 10000 paise is 1800 paise. */
export function shareOf(amount: Paise, bp: BasisPoints): Paise {
  return portion(amount, bp, Number(BP_SCALE));
}

/** Half of that share: one of the two equal halves (CGST, SGST) of an intra-state tax. */
export function halfShareOf(amount: Paise, bp: BasisPoints): Paise {
  return portion(amount, bp, Number(BP_SCALE) * 2);
}

/** Removes tax from a tax-inclusive amount: 118.00 at 18% gives 100.00. */
export function exclusiveOf(inclusive: Paise, bp: BasisPoints): Paise {
  if (inclusive <= 0) return 0;
  if (bp <= 0) return Math.round(inclusive);
  return Number(divideHalfUp(BigInt(Math.round(inclusive)) * BP_SCALE, BP_SCALE + BigInt(Math.round(bp))));
}

/** Parses what a person types into a money field ("1,23,456.50", "₹ 500") into paise. */
export function parseMoney(input: string): Paise | null {
  const cleaned = input.replace(/[₹$€£,\s]/g, '');
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  return Number(BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0') || '0'));
}

const LOCALE: Record<CurrencyCode, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'en-IE',
  GBP: 'en-GB',
  AUD: 'en-AU',
  CAD: 'en-CA',
  SGD: 'en-SG',
  AED: 'en-AE',
};

/** "1,23,456.78": Indian grouping for rupees, the usual grouping for everything else. No symbol. */
export function formatAmount(paise: Paise, currency: CurrencyCode = 'INR'): string {
  return new Intl.NumberFormat(LOCALE[currency], { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    paise / 100,
  );
}

const SYMBOL: Record<CurrencyCode, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  AED: 'AED ',
};

/** "₹1,23,456.78" */
export function formatMoney(paise: Paise, currency: CurrencyCode = 'INR'): string {
  const sign = paise < 0 ? '−' : '';
  return `${sign}${SYMBOL[currency]}${formatAmount(Math.abs(paise), currency)}`;
}

/** "₹1.2L", "₹3.4Cr": compact figures for chart axes. Rupees only. */
export function formatCompactRupees(paise: Paise): string {
  const rupees = Math.abs(paise) / 100;
  if (rupees >= 1_00_00_000) return `₹${trim(rupees / 1_00_00_000)}Cr`;
  if (rupees >= 1_00_000) return `₹${trim(rupees / 1_00_000)}L`;
  if (rupees >= 1000) return `₹${trim(rupees / 1000)}k`;
  return `₹${Math.round(rupees)}`;
}

function trim(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
}

/** "18%", "0.25%" */
export function formatRate(bp: BasisPoints): string {
  return `${(bp / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

export const CURRENCIES: readonly CurrencyCode[] = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'];
