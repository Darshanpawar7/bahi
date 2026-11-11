import { daysBetween, monthKey, monthsOf, type FinancialYear } from './dates';
import { settlementOf, statusOf, type Settlement } from './status';
import { computeInvoice, type InvoiceTotals } from './tax';
import type { AppData, Client, Invoice, InvoiceStatus, Paise } from './types';

/** An invoice joined with its client and everything derived from it. */
export interface InvoiceView {
  invoice: Invoice;
  client: Client;
  totals: InvoiceTotals;
  status: InvoiceStatus;
  settlement: Settlement;
  /** Rupees per unit of the invoice currency: 1 for rupee invoices, null when no rate was given. */
  toInr: number | null;
}

const PLACEHOLDER_CLIENT: Client = {
  id: '',
  name: 'No client chosen',
  address: '',
  country: 'IN',
  stateCode: '',
  gstin: '',
  email: '',
};

export function viewInvoices(data: AppData, today: string): InvoiceView[] {
  const business = data.business;
  if (!business) return [];
  const clients = new Map(data.clients.map(client => [client.id, client]));
  return data.invoices.map(invoice => {
    const client = clients.get(invoice.clientId) ?? { ...PLACEHOLDER_CLIENT, stateCode: invoice.placeOfSupply };
    const totals = computeInvoice(invoice, business, client);
    return {
      invoice,
      client,
      totals,
      status: statusOf(invoice, totals.total, today),
      settlement: settlementOf(invoice, totals.total),
      toInr: invoice.currency === 'INR' ? 1 : invoice.exchangeRate,
    };
  });
}

export interface MonthFigures {
  key: string;
  label: string;
  invoiced: Paise;
  received: Paise;
}

export interface Summary {
  /** Totals of invoices raised in the financial year (drafts and void invoices excluded), in rupees. */
  invoiced: Paise;
  /** Cash received in the financial year, in rupees. */
  received: Paise;
  /** TDS deducted on payments in the financial year. */
  tds: Paise;
  /** What is owed today across all open invoices, in rupees. */
  outstanding: Paise;
  /** The part of that which is past its due date. */
  overdue: Paise;
  months: MonthFigures[];
  /** Foreign-currency invoices left out of the rupee figures because they have no exchange rate. */
  unconverted: number;
}

const OPEN: ReadonlySet<InvoiceStatus> = new Set(['sent', 'partially-paid', 'overdue']);
const BILLED: ReadonlySet<InvoiceStatus> = new Set(['sent', 'partially-paid', 'overdue', 'paid']);

const inRupees = (amount: Paise, rate: number): Paise => Math.round(amount * rate);

export function summarise(views: readonly InvoiceView[], fy: FinancialYear): Summary {
  const months = new Map(monthsOf(fy).map(month => [month.key, { ...month, invoiced: 0, received: 0 }]));
  const summary: Summary = { invoiced: 0, received: 0, tds: 0, outstanding: 0, overdue: 0, months: [], unconverted: 0 };
  for (const view of views) {
    if (!BILLED.has(view.status)) continue;
    const rate = view.toInr;
    if (rate === null) {
      summary.unconverted += 1;
      continue;
    }
    if (view.invoice.date >= fy.start && view.invoice.date <= fy.end) {
      const amount = inRupees(view.totals.total, rate);
      summary.invoiced += amount;
      const month = months.get(monthKey(view.invoice.date));
      if (month) month.invoiced += amount;
    }
    for (const payment of view.invoice.payments) {
      if (payment.date < fy.start || payment.date > fy.end) continue;
      const amount = inRupees(payment.amountPaise, rate);
      summary.received += amount;
      summary.tds += inRupees(payment.tdsPaise, rate);
      const month = months.get(monthKey(payment.date));
      if (month) month.received += amount;
    }
    if (OPEN.has(view.status)) {
      const balance = inRupees(view.settlement.balance, rate);
      summary.outstanding += balance;
      if (view.status === 'overdue') summary.overdue += balance;
    }
  }
  return { ...summary, months: [...months.values()] };
}

export interface Attention {
  view: InvoiceView;
  /** Negative when overdue: -3 means three days late. */
  daysLeft: number;
}

const DUE_SOON_DAYS = 7;

/** Invoices that are overdue or fall due within a week, most urgent first. */
export function needsAttention(views: readonly InvoiceView[], today: string): Attention[] {
  return views
    .filter(view => OPEN.has(view.status))
    .map(view => ({ view, daysLeft: daysBetween(today, view.invoice.dueDate) }))
    .filter(item => item.daysLeft <= DUE_SOON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** "3 days overdue", "due today", "due in 5 days" */
export function dueLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'due today';
  const count = Math.abs(daysLeft);
  const days = count === 1 ? '1 day' : `${count} days`;
  return daysLeft < 0 ? `${days} overdue` : `due in ${days}`;
}

export interface ClientFigures {
  billed: Paise;
  outstanding: Paise;
  invoices: number;
}

/** Per-client totals in rupees, for the client list. */
export function clientFigures(views: readonly InvoiceView[]): Map<string, ClientFigures> {
  const figures = new Map<string, ClientFigures>();
  for (const view of views) {
    const current = figures.get(view.client.id) ?? { billed: 0, outstanding: 0, invoices: 0 };
    const rate = view.toInr ?? 0;
    figures.set(view.client.id, {
      invoices: current.invoices + 1,
      billed: current.billed + (BILLED.has(view.status) ? inRupees(view.totals.total, rate) : 0),
      outstanding: current.outstanding + (OPEN.has(view.status) ? inRupees(view.settlement.balance, rate) : 0),
    });
  }
  return figures;
}

/** A short, polite message to send with an invoice or as a reminder. */
export function paymentMessage(
  view: InvoiceView,
  businessName: string,
  upiId: string,
  formatted: { amount: string; due: string },
): string {
  const pay = view.invoice.currency === 'INR' && upiId.trim() ? ` You can pay by UPI to ${upiId.trim()}.` : '';
  return `Hello, this is ${businessName}. Invoice ${view.invoice.number} for ${formatted.amount} is due on ${formatted.due}.${pay} Thank you.`;
}
