import type { CurrencyCode, Paise } from './types';

const ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'] as const;

const CRORE = 1_00_00_000;
const LAKH = 1_00_000;

function belowHundred(value: number): string {
  if (value < 20) return ONES[value] ?? '';
  const tens = TENS[Math.floor(value / 10)] ?? '';
  const ones = value % 10;
  return ones === 0 ? tens : `${tens}-${ONES[ones] ?? ''}`;
}

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const head = hundreds > 0 ? `${ONES[hundreds] ?? ''} Hundred` : '';
  if (rest === 0) return head;
  return head ? `${head} ${belowHundred(rest)}` : belowHundred(rest);
}

/** Whole numbers in the Indian system: thousand, lakh, crore. "One Lakh Twenty-Three Thousand". */
export function indianWords(value: number): string {
  if (value === 0) return 'Zero';
  const parts: string[] = [];
  const crores = Math.floor(value / CRORE);
  // Beyond 99 crore the crore count is itself spoken as a number: "One Hundred Crore".
  if (crores > 0) parts.push(`${indianWords(crores)} Crore`);
  const lakhs = Math.floor((value % CRORE) / LAKH);
  if (lakhs > 0) parts.push(`${belowHundred(lakhs)} Lakh`);
  const thousands = Math.floor((value % LAKH) / 1000);
  if (thousands > 0) parts.push(`${belowHundred(thousands)} Thousand`);
  const rest = value % 1000;
  if (rest > 0) parts.push(belowThousand(rest));
  return parts.join(' ');
}

const SCALES = [
  [1_000_000_000_000, 'Trillion'],
  [1_000_000_000, 'Billion'],
  [1_000_000, 'Million'],
  [1000, 'Thousand'],
] as const;

/** Whole numbers in the international system: thousand, million, billion. */
export function internationalWords(value: number): string {
  if (value === 0) return 'Zero';
  const parts: string[] = [];
  let rest = value;
  for (const [size, name] of SCALES) {
    const count = Math.floor(rest / size);
    if (count > 0) parts.push(`${internationalWords(count)} ${name}`);
    rest %= size;
  }
  if (rest > 0) parts.push(belowThousand(rest));
  return parts.join(' ');
}

const UNITS: Record<CurrencyCode, readonly [major: string, minor: string]> = {
  INR: ['Rupees', 'Paise'],
  USD: ['US Dollars', 'Cents'],
  EUR: ['Euros', 'Cents'],
  GBP: ['Pounds Sterling', 'Pence'],
  AUD: ['Australian Dollars', 'Cents'],
  CAD: ['Canadian Dollars', 'Cents'],
  SGD: ['Singapore Dollars', 'Cents'],
  AED: ['UAE Dirhams', 'Fils'],
};

/**
 * The amount as it is written on an invoice.
 * "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight Paise Only"
 */
export function amountInWords(amount: Paise, currency: CurrencyCode = 'INR'): string {
  const [major, minor] = UNITS[currency];
  const value = Math.max(0, Math.round(amount));
  const whole = Math.floor(value / 100);
  const fraction = value % 100;
  const speak = currency === 'INR' ? indianWords : internationalWords;
  if (whole === 0 && fraction > 0) return `${belowHundred(fraction)} ${minor} Only`;
  const head = `${major} ${speak(whole)}`;
  return fraction > 0 ? `${head} and ${belowHundred(fraction)} ${minor} Only` : `${head} Only`;
}
