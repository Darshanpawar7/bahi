import { z } from 'zod';
import type { AppData } from './types';

/**
 * A backup file comes from outside the app, so it is treated as hostile input: it is size-capped, parsed
 * as JSON, and then every field is checked. Unknown fields are dropped. Nothing from the file is trusted
 * to be the shape it claims to be.
 */

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_CHARS = 400_000;
const MAX_RECORDS = 5000;

const text = (max = 500) => z.string().max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().int().min(0).max(1e13);
const basisPoints = z.number().int().min(0).max(10_000);
const id = z.string().min(1).max(80);

const logo = z
  .string()
  .max(MAX_LOGO_CHARS)
  .refine(value => value === '' || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value), {
    message: 'logo must be a PNG, JPEG or WebP image',
  });

const business = z.object({
  name: text(200),
  address: text(600),
  stateCode: z.string().regex(/^\d{2}$/),
  registration: z.enum(['regular', 'composition', 'unregistered']),
  gstin: text(15),
  pan: text(10),
  email: text(200),
  phone: text(40),
  bankName: text(200),
  bankAccount: text(60),
  ifsc: text(20),
  upiId: text(320),
  lutNumber: text(60),
  numbering: z.object({ prefix: text(8), digits: z.number().int().min(1).max(6) }),
  defaultGstRateBp: basisPoints,
  quickRatesBp: z.array(basisPoints).max(8),
  defaultDueDays: z.number().int().min(0).max(365),
  defaultTerms: text(1000),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  logo,
});

const client = z.object({
  id,
  name: text(200),
  address: text(600),
  country: z.string().regex(/^[A-Z]{2}$/),
  stateCode: z.string().regex(/^(\d{2})?$/),
  gstin: text(15),
  email: text(200),
});

const line = z.object({
  id,
  description: text(300),
  detail: text(600),
  sac: text(10),
  quantity: z.number().min(0).max(1e7),
  unit: text(20),
  ratePaise: money,
  discount: z.object({ kind: z.enum(['percent', 'flat']), value: z.number().min(0).max(1e13) }).nullable(),
  gstRateBp: basisPoints,
});

const payment = z.object({
  id,
  date: isoDate,
  amountPaise: money,
  tdsPaise: money,
  mode: z.enum(['upi', 'bank', 'cheque', 'cash', 'other']),
  reference: text(120),
});

const invoice = z.object({
  id,
  number: text(40),
  clientId: z.string().max(80),
  date: isoDate,
  dueDate: isoDate,
  placeOfSupply: z.string().regex(/^(\d{2})?$/),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED']),
  exchangeRate: z.number().positive().max(1e6).nullable(),
  lines: z.array(line).max(200),
  notes: text(2000),
  terms: text(2000),
  reverseCharge: z.boolean(),
  pricesIncludeTax: z.boolean(),
  exportWithIgst: z.boolean(),
  roundOff: z.boolean(),
  sent: z.boolean(),
  voided: z.boolean(),
  payments: z.array(payment).max(200),
});

export const appDataSchema = z.object({
  version: z.literal(1),
  business: business.nullable(),
  clients: z.array(client).max(MAX_RECORDS),
  invoices: z.array(invoice).max(MAX_RECORDS),
  sample: z.boolean(),
});

const backupSchema = z.object({
  app: z.literal('bahi'),
  exportedAt: z.string().max(40),
  data: appDataSchema,
});

export type BackupResult = { ok: true; data: AppData } | { ok: false; message: string };

export function serialiseBackup(data: AppData, exportedAt: string): string {
  return JSON.stringify({ app: 'bahi', exportedAt, data }, null, 2);
}

export function parseBackup(fileText: string): BackupResult {
  if (fileText.length > MAX_BACKUP_BYTES) return { ok: false, message: 'That file is too large to be a Bahi backup.' };
  let raw: unknown;
  try {
    raw = JSON.parse(fileText);
  } catch {
    return { ok: false, message: 'That file is not valid JSON, so it is not a Bahi backup.' };
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? ` (at ${issue.path.join('.')})` : '';
    return { ok: false, message: `That file is not a Bahi backup, or it has been changed${where}.` };
  }
  return { ok: true, data: parsed.data.data };
}

/** Validates what comes back from the browser's own storage, which can also be stale or tampered with. */
export function parseStored(value: unknown): AppData | null {
  const parsed = appDataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** "bahi-backup-2026-11-11.json" */
export function backupFileName(today: string): string {
  return `bahi-backup-${today}.json`;
}
