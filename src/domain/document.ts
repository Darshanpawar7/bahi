import { formatDate } from './dates';
import { formatAmount, formatMoney, formatRate } from './money';
import { placeOfSupplyLabel, stateName } from './states';
import { settlementOf, statusOf } from './status';
import { computeInvoice, documentTitle, endorsements, type DocumentTitle, type InvoiceTotals } from './tax';
import type { Business, Client, CurrencyCode, Invoice, InvoiceStatus, Paise } from './types';
import { isValidVpa, upiUri } from './upi';
import { amountInWords } from './words';

export interface DocumentLine {
  no: string;
  description: string;
  detail: string;
  sac: string;
  quantity: string;
  rate: string;
  discount: string;
  taxable: string;
  gstRate: string;
  amount: string;
}

export interface DocumentRow {
  label: string;
  value: string;
  /** "total" rows are the focal point of their block. */
  kind: 'plain' | 'muted' | 'total';
}

export interface TaxSummary {
  head: string[];
  rows: string[][];
}

export interface DocumentParty {
  name: string;
  addressLines: string[];
  /** Label and value pairs such as GSTIN, PAN, State. */
  facts: Array<{ label: string; value: string }>;
}

export interface InvoiceDocument {
  title: DocumentTitle;
  number: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  /** The rubber stamp on the sheet, when the status earns one. */
  stamp: 'PAID' | 'VOID' | 'DRAFT' | null;
  accent: string;
  currency: CurrencyCode;
  logo: string;
  supplier: DocumentParty;
  recipient: DocumentParty;
  placeOfSupply: string;
  showTax: boolean;
  showSac: boolean;
  showDiscount: boolean;
  lines: DocumentLine[];
  totals: DocumentRow[];
  amountInWords: string;
  taxSummary: TaxSummary | null;
  /** Null when there is nothing to scan: not rupees, no UPI ID, or nothing left to pay. */
  upiUri: string | null;
  upiId: string;
  bank: Array<{ label: string; value: string }>;
  notes: string;
  terms: string;
  endorsements: string[];
  balanceDue: Paise;
  /** "INV-26-27-001_Monsoon-Labs.pdf" */
  fileName: string;
}

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '');

const fact = (label: string, value: string) => ({ label, value: value.trim() });
const present = (items: Array<{ label: string; value: string }>) => items.filter(item => item.value !== '');

/** Trims trailing zeros: 2 stays "2", 2.5 stays "2.5", 1.250 becomes "1.25". */
function formatQuantity(quantity: number, unit: string): string {
  const text = String(Number(quantity.toFixed(3)));
  return unit.trim() ? `${text} ${unit.trim()}` : text;
}

/** Keeps a file name safe on every operating system and free of path tricks. */
export function safeFilePart(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function taxLabel(name: string, rates: number[], halve: boolean): string {
  const [only] = rates;
  if (rates.length !== 1 || only === undefined) return name;
  return `${name} ${formatRate(halve ? only / 2 : only)}`;
}

function totalsRows(invoice: Invoice, totals: InvoiceTotals): DocumentRow[] {
  const money = (value: Paise) => formatMoney(value, invoice.currency);
  const rows: DocumentRow[] = [];
  if (totals.discount > 0) {
    rows.push({ label: 'Subtotal', value: money(totals.subtotal), kind: 'plain' });
    rows.push({ label: 'Discount', value: `−${money(totals.discount)}`, kind: 'plain' });
  }
  rows.push({ label: totals.tax > 0 ? 'Taxable value' : 'Subtotal', value: money(totals.taxable), kind: 'plain' });
  const rates = [...new Set(totals.lines.filter(line => line.tax > 0).map(line => line.rateBp))];
  const suffix = totals.tax > 0 && totals.taxCharged === 0 ? ' (payable by recipient)' : '';
  const taxKind = suffix ? 'muted' : 'plain';
  if (totals.cgst > 0) {
    rows.push({ label: taxLabel('CGST', rates, true) + suffix, value: money(totals.cgst), kind: taxKind });
    rows.push({
      label: taxLabel(totals.stateTaxLabel, rates, true) + suffix,
      value: money(totals.sgst),
      kind: taxKind,
    });
  }
  if (totals.igst > 0) {
    rows.push({ label: taxLabel('IGST', rates, false) + suffix, value: money(totals.igst), kind: taxKind });
  }
  if (totals.roundOff !== 0) {
    const sign = totals.roundOff > 0 ? '+' : '−';
    rows.push({ label: 'Round off', value: `${sign}${money(Math.abs(totals.roundOff))}`, kind: 'muted' });
  }
  rows.push({ label: 'Total', value: money(totals.total), kind: 'total' });
  const settlement = settlementOf(invoice, totals.total);
  if (settlement.settled > 0) {
    if (settlement.received > 0)
      rows.push({ label: 'Received', value: `−${money(settlement.received)}`, kind: 'plain' });
    if (settlement.tds > 0) rows.push({ label: 'TDS deducted', value: `−${money(settlement.tds)}`, kind: 'plain' });
    rows.push({ label: 'Balance due', value: money(settlement.balance), kind: 'total' });
  }
  return rows;
}

function taxSummaryOf(invoice: Invoice, totals: InvoiceTotals): TaxSummary | null {
  if (totals.tax === 0) return null;
  const amount = (value: Paise) => formatAmount(value, invoice.currency);
  if (totals.supplyType === 'intra') {
    return {
      head: ['HSN/SAC', 'Taxable value', 'CGST', totals.stateTaxLabel, 'Total tax'],
      rows: totals.groups.map(group => [
        group.sac || '—',
        amount(group.taxable),
        `${amount(group.cgst)} @ ${formatRate(group.rateBp / 2)}`,
        `${amount(group.sgst)} @ ${formatRate(group.rateBp / 2)}`,
        amount(group.cgst + group.sgst),
      ]),
    };
  }
  return {
    head: ['HSN/SAC', 'Taxable value', 'IGST', 'Total tax'],
    rows: totals.groups.map(group => [
      group.sac || '—',
      amount(group.taxable),
      `${amount(group.igst)} @ ${formatRate(group.rateBp)}`,
      amount(group.igst),
    ]),
  };
}

function stampOf(status: InvoiceStatus): InvoiceDocument['stamp'] {
  if (status === 'paid') return 'PAID';
  if (status === 'void') return 'VOID';
  return status === 'draft' ? 'DRAFT' : null;
}

/**
 * Everything an invoice shows, already worked out and formatted.
 * The on-screen sheet and the printed PDF both render exactly this, so they cannot disagree.
 */
export function buildInvoiceDocument(
  invoice: Invoice,
  business: Business,
  client: Client,
  today: string,
): InvoiceDocument {
  const totals = computeInvoice(invoice, business, client);
  const status = statusOf(invoice, totals.total, today);
  const settlement = settlementOf(invoice, totals.total);
  const registered = business.registration !== 'unregistered';
  const domestic = client.country === 'IN';
  const amount = (value: Paise) => formatAmount(value, invoice.currency);

  const supplier: DocumentParty = {
    name: business.name,
    addressLines: lines(business.address),
    facts: present([
      fact('GSTIN', registered ? business.gstin : ''),
      fact('PAN', business.pan),
      fact('State', registered ? placeOfSupplyLabel(business.stateCode) : stateName(business.stateCode)),
      fact('Email', business.email),
      fact('Phone', business.phone),
    ]),
  };
  const recipient: DocumentParty = {
    name: client.name,
    addressLines: lines(client.address),
    facts: present([
      fact('GSTIN', registered ? client.gstin : ''),
      fact('State', domestic ? placeOfSupplyLabel(client.stateCode) : ''),
      fact('Email', client.email),
    ]),
  };

  const payable = invoice.currency === 'INR' && isValidVpa(business.upiId) && settlement.balance > 0 && !invoice.voided;

  return {
    title: documentTitle(business),
    number: invoice.number,
    date: formatDate(invoice.date),
    dueDate: formatDate(invoice.dueDate),
    status,
    stamp: stampOf(status),
    accent: business.accent,
    currency: invoice.currency,
    logo: business.logo,
    supplier,
    recipient,
    placeOfSupply: registered && domestic ? placeOfSupplyLabel(invoice.placeOfSupply) : '',
    showTax: totals.tax > 0,
    showSac: registered && invoice.lines.some(line => line.sac.trim() !== ''),
    showDiscount: totals.discount > 0,
    lines: invoice.lines.map((line, index) => {
      const computed = totals.lines[index];
      return {
        no: String(index + 1),
        description: line.description,
        detail: line.detail,
        sac: line.sac.trim(),
        quantity: formatQuantity(line.quantity, line.unit),
        rate: amount(line.ratePaise),
        discount: computed && computed.discount > 0 ? amount(computed.discount) : '',
        taxable: amount(computed?.taxable ?? 0),
        gstRate: computed && computed.tax > 0 ? formatRate(computed.rateBp) : '',
        amount: amount(computed?.total ?? 0),
      };
    }),
    totals: totalsRows(invoice, totals),
    amountInWords: amountInWords(totals.total, invoice.currency),
    taxSummary: taxSummaryOf(invoice, totals),
    upiUri: payable
      ? upiUri({ vpa: business.upiId, payeeName: business.name, amountPaise: settlement.balance, note: invoice.number })
      : null,
    upiId: business.upiId.trim(),
    bank: present([
      fact('Bank', business.bankName),
      fact('Account', business.bankAccount),
      fact('IFSC', business.ifsc),
    ]),
    notes: invoice.notes.trim(),
    terms: invoice.terms.trim(),
    endorsements: endorsements(invoice, business, totals.supplyType),
    balanceDue: settlement.balance,
    fileName: `${safeFilePart(invoice.number)}_${safeFilePart(client.name) || 'invoice'}.pdf`,
  };
}
