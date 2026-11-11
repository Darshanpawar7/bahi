import { isStateCode } from './states';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_SHAPE = /^[A-Z]{5}\d{4}[A-Z]$/;

export type GstinProblem = 'empty' | 'length' | 'shape' | 'state' | 'checksum';

export type GstinResult =
  { ok: true; gstin: string; stateCode: string; pan: string } | { ok: false; problem: GstinProblem; message: string };

const MESSAGE: Record<GstinProblem, string> = {
  empty: 'Enter a GSTIN.',
  length: 'A GSTIN has exactly 15 characters.',
  shape: 'That does not look like a GSTIN. It should read like 29ABCDE1234F1Z5.',
  state: 'The first two digits are not a GST state code.',
  checksum: 'The last character does not match the rest. Check for a typing mistake.',
};

/**
 * The check character of a GSTIN, from its first 14 characters.
 * Each character maps to 0-35; values are weighted 1, 2, 1, 2...; each product contributes
 * floor(p / 36) + (p mod 36); the check value is (36 - (sum mod 36)) mod 36.
 */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let index = 0; index < 14; index++) {
    const value = ALPHABET.indexOf(first14.charAt(index));
    const product = value * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET.charAt((36 - (sum % 36)) % 36);
}

/** Upper-cases and strips spaces, as people paste GSTINs in every possible way. */
export function normaliseGstin(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function validateGstin(input: string): GstinResult {
  const gstin = normaliseGstin(input);
  const fail = (problem: GstinProblem): GstinResult => ({ ok: false, problem, message: MESSAGE[problem] });
  if (gstin === '') return fail('empty');
  if (gstin.length !== 15) return fail('length');
  if (!GSTIN_SHAPE.test(gstin)) return fail('shape');
  const stateCode = gstin.slice(0, 2);
  if (!isStateCode(stateCode)) return fail('state');
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin.charAt(14)) return fail('checksum');
  return { ok: true, gstin, stateCode, pan: gstin.slice(2, 12) };
}

export function isValidPan(input: string): boolean {
  return PAN_SHAPE.test(input.trim().toUpperCase());
}

/** Builds a GSTIN with a correct check character. Used to make the sample data realistic. */
export function makeGstin(stateCode: string, pan: string, entity = '1'): string {
  const first14 = `${stateCode}${pan.toUpperCase()}${entity}Z`;
  return first14 + gstinCheckCharacter(first14);
}
