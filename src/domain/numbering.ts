import { financialYearOf, type FinancialYear } from './dates';
import type { Numbering } from './types';

/** GST rule 46: at most sixteen characters; letters, digits, hyphen and slash only. */
const GST_NUMBER_SHAPE = /^[A-Za-z0-9/-]{1,16}$/;
export const GST_NUMBER_MAX_LENGTH = 16;

export function formatInvoiceNumber(numbering: Numbering, fy: FinancialYear, sequence: number): string {
  const running = String(sequence).padStart(Math.max(1, numbering.digits), '0');
  const prefix = numbering.prefix.trim();
  return prefix ? `${prefix}/${fy.short}/${running}` : `${fy.short}/${running}`;
}

/** The running number inside an invoice number of this financial year, or null if it is not one of ours. */
export function sequenceOf(number: string, numbering: Numbering, fy: FinancialYear): number | null {
  const prefix = numbering.prefix.trim();
  const head = prefix ? `${prefix}/${fy.short}/` : `${fy.short}/`;
  if (!number.startsWith(head)) return null;
  const tail = number.slice(head.length);
  return /^\d+$/.test(tail) ? Number(tail) : null;
}

/**
 * The next free number for an invoice dated `date`. The running number restarts every financial year and is
 * always one more than the highest already used, so a number is never handed out twice.
 */
export function nextInvoiceNumber(numbering: Numbering, existing: readonly string[], date: string): string {
  const fy = financialYearOf(date);
  const used = existing.map(number => sequenceOf(number, numbering, fy)).filter((n): n is number => n !== null);
  return formatInvoiceNumber(numbering, fy, Math.max(0, ...used) + 1);
}

/** Returns a message a person can act on, or null when the number is fine. */
export function invoiceNumberProblem(number: string, gstRegistered: boolean, others: readonly string[]): string | null {
  const trimmed = number.trim();
  if (trimmed === '') return 'Give the invoice a number.';
  if (others.includes(trimmed)) return 'Another invoice already has this number.';
  if (!gstRegistered) return null;
  if (trimmed.length > GST_NUMBER_MAX_LENGTH) return 'GST allows at most 16 characters in an invoice number.';
  if (!GST_NUMBER_SHAPE.test(trimmed)) return 'GST allows only letters, digits, hyphen and slash in an invoice number.';
  return null;
}
