import { shareOf } from './money';
import type { Invoice, InvoiceStatus, Paise } from './types';

export interface Settlement {
  /** Money actually received. */
  received: Paise;
  /** Tax the client deducted at source and paid to the government on the supplier's behalf. */
  tds: Paise;
  /** received + tds: how much of the invoice is settled. */
  settled: Paise;
  /** What is still owed. Never negative. */
  balance: Paise;
}

export function settlementOf(invoice: Pick<Invoice, 'payments'>, total: Paise): Settlement {
  const received = invoice.payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
  const tds = invoice.payments.reduce((sum, payment) => sum + payment.tdsPaise, 0);
  const settled = received + tds;
  return { received, tds, settled, balance: Math.max(0, total - settled) };
}

/**
 * - void wins over everything
 * - paid when cash received plus TDS covers the total
 * - overdue when it has been sent (or part paid) and the due date has passed
 */
export function statusOf(
  invoice: Pick<Invoice, 'payments' | 'sent' | 'voided' | 'dueDate'>,
  total: Paise,
  today: string,
): InvoiceStatus {
  if (invoice.voided) return 'void';
  const { settled } = settlementOf(invoice, total);
  if (total > 0 && settled >= total) return 'paid';
  const open = invoice.sent || settled > 0;
  if (!open) return 'draft';
  if (invoice.dueDate !== '' && today > invoice.dueDate) return 'overdue';
  return settled > 0 ? 'partially-paid' : 'sent';
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  'partially-paid': 'Part paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};

/** TDS a client may deduct: a percentage of the taxable value, never of the GST. */
export function expectedTds(taxable: Paise, percent: number): Paise {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return shareOf(taxable, Math.round(Math.min(percent, 100) * 100));
}
