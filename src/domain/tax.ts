import { exclusiveOf, halfShareOf, lineAmount, portion, shareOf } from './money';
import { stateTaxLabel } from './states';
import type { BasisPoints, Business, Client, Invoice, LineItem, Paise, SupplyType } from './types';

export interface LineTotals {
  id: string;
  /** quantity x rate */
  gross: Paise;
  discount: Paise;
  taxable: Paise;
  rateBp: BasisPoints;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  tax: Paise;
  total: Paise;
}

export interface TaxGroup {
  sac: string;
  rateBp: BasisPoints;
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
}

export interface InvoiceTotals {
  supplyType: SupplyType;
  /** "SGST" for states, "UTGST" for union territories without a legislature. */
  stateTaxLabel: 'SGST' | 'UTGST';
  lines: LineTotals[];
  subtotal: Paise;
  discount: Paise;
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  /** Tax computed on the supply, whoever pays it. */
  tax: Paise;
  /** Tax added to what the client pays. Zero under reverse charge. */
  taxCharged: Paise;
  roundOff: Paise;
  /** The amount payable. */
  total: Paise;
  /** HSN/SAC summary: one row per code and rate. */
  groups: TaxGroup[];
}

const PERCENT_TO_BP = 100;
const RUPEE = 100;

/**
 * Which tax regime applies.
 * - A supplier who is not a regular GST registrant charges no tax at all.
 * - A client outside India makes it an export.
 * - Supplier state equal to the place of supply is intra-state (CGST + SGST), otherwise inter-state (IGST).
 */
export function supplyTypeOf(
  business: Pick<Business, 'registration' | 'stateCode'>,
  client: Pick<Client, 'country'>,
  placeOfSupply: string,
): SupplyType {
  if (business.registration !== 'regular') return 'untaxed';
  if (client.country !== 'IN') return 'export';
  return business.stateCode === placeOfSupply ? 'intra' : 'inter';
}

function discountOf(line: LineItem, gross: Paise): Paise {
  if (!line.discount || line.discount.value <= 0) return 0;
  if (line.discount.kind === 'flat') return Math.min(Math.round(line.discount.value), gross);
  const percent = Math.min(line.discount.value, 100);
  return portion(gross, Math.round(percent * PERCENT_TO_BP), 100 * PERCENT_TO_BP);
}

export interface TaxContext {
  supplyType: SupplyType;
  pricesIncludeTax: boolean;
  /** Exports only: true charges IGST, false supplies under a Letter of Undertaking. */
  exportWithIgst: boolean;
}

export function computeLine(line: LineItem, context: TaxContext): LineTotals {
  const gross = lineAmount(line.quantity, line.ratePaise);
  const discount = discountOf(line, gross);
  const net = gross - discount;
  const rateBp = Math.max(0, line.gstRateBp);
  const taxed =
    context.supplyType === 'intra' ||
    context.supplyType === 'inter' ||
    (context.supplyType === 'export' && context.exportWithIgst);
  const base = { id: line.id, gross, discount, rateBp: taxed ? rateBp : 0 };
  if (!taxed) return { ...base, taxable: net, cgst: 0, sgst: 0, igst: 0, tax: 0, total: net };

  const taxable = context.pricesIncludeTax ? exclusiveOf(net, rateBp) : net;
  if (context.supplyType === 'intra') {
    // Each half is rounded on its own, so CGST and SGST are always the same figure.
    const half = halfShareOf(taxable, rateBp);
    return { ...base, taxable, cgst: half, sgst: half, igst: 0, tax: half * 2, total: taxable + half * 2 };
  }
  const igst = shareOf(taxable, rateBp);
  return { ...base, taxable, cgst: 0, sgst: 0, igst, tax: igst, total: taxable + igst };
}

function groupBySacAndRate(lines: LineItem[], totals: LineTotals[]): TaxGroup[] {
  const groups = new Map<string, TaxGroup>();
  lines.forEach((line, index) => {
    const line_ = totals[index];
    if (!line_) return;
    const sac = line.sac.trim();
    const key = `${sac}|${line_.rateBp}`;
    const existing = groups.get(key) ?? { sac, rateBp: line_.rateBp, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    groups.set(key, {
      ...existing,
      taxable: existing.taxable + line_.taxable,
      cgst: existing.cgst + line_.cgst,
      sgst: existing.sgst + line_.sgst,
      igst: existing.igst + line_.igst,
    });
  });
  return [...groups.values()];
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

export function computeInvoice(invoice: Invoice, business: Business, client: Client): InvoiceTotals {
  const supplyType = supplyTypeOf(business, client, invoice.placeOfSupply);
  const context: TaxContext = {
    supplyType,
    pricesIncludeTax: invoice.pricesIncludeTax,
    exportWithIgst: invoice.exportWithIgst,
  };
  const lines = invoice.lines.map(line => computeLine(line, context));
  const taxable = sum(lines.map(line => line.taxable));
  const tax = sum(lines.map(line => line.tax));
  // Under reverse charge the recipient pays the tax to the government, so it is shown but not billed.
  const reverse = invoice.reverseCharge && (supplyType === 'intra' || supplyType === 'inter');
  const taxCharged = reverse ? 0 : tax;
  const exact = taxable + taxCharged;
  // Rounding to the whole rupee is an Indian invoicing convention; foreign-currency invoices keep their cents.
  const rounded = invoice.roundOff && invoice.currency === 'INR' ? Math.round(exact / RUPEE) * RUPEE : exact;
  return {
    supplyType,
    stateTaxLabel: stateTaxLabel(invoice.placeOfSupply),
    lines,
    subtotal: sum(lines.map(line => line.gross)),
    discount: sum(lines.map(line => line.discount)),
    taxable,
    cgst: sum(lines.map(line => line.cgst)),
    sgst: sum(lines.map(line => line.sgst)),
    igst: sum(lines.map(line => line.igst)),
    tax,
    taxCharged,
    roundOff: rounded - exact,
    total: rounded,
    groups: groupBySacAndRate(invoice.lines, lines),
  };
}

export type DocumentTitle = 'Tax Invoice' | 'Bill of Supply' | 'Invoice';

export function documentTitle(business: Pick<Business, 'registration'>): DocumentTitle {
  if (business.registration === 'regular') return 'Tax Invoice';
  return business.registration === 'composition' ? 'Bill of Supply' : 'Invoice';
}

export const ENDORSEMENT = {
  composition: 'Composition taxable person, not eligible to collect tax on supplies',
  exportLut: 'SUPPLY MEANT FOR EXPORT UNDER LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX',
  exportIgst: 'SUPPLY MEANT FOR EXPORT ON PAYMENT OF INTEGRATED TAX',
  reverseCharge: 'Tax payable by the recipient under reverse charge',
  unregistered: 'Supplier is not registered under GST',
} as const;

/** The statements the law, or plain honesty, requires on the face of this invoice. */
export function endorsements(invoice: Invoice, business: Business, supplyType: SupplyType): string[] {
  if (business.registration === 'composition') return [ENDORSEMENT.composition];
  if (business.registration === 'unregistered') return [ENDORSEMENT.unregistered];
  if (supplyType === 'export') {
    if (invoice.exportWithIgst) return [ENDORSEMENT.exportIgst];
    const lut = business.lutNumber.trim();
    return lut ? [ENDORSEMENT.exportLut, `LUT reference: ${lut}`] : [ENDORSEMENT.exportLut];
  }
  return invoice.reverseCharge ? [ENDORSEMENT.reverseCharge] : [];
}

/** One plain sentence saying why the tax lines are what they are. Shown under the totals in the editor. */
export function explainTax(invoice: Invoice, business: Business, totals: InvoiceTotals): string {
  if (business.registration === 'composition') return 'Composition scheme: no tax is charged on the invoice.';
  if (business.registration === 'unregistered') return 'You are not registered under GST, so no tax is charged.';
  switch (totals.supplyType) {
    case 'export':
      return invoice.exportWithIgst
        ? 'Export on payment of IGST: integrated tax at the full rate.'
        : 'Export under a Letter of Undertaking: zero-rated, so no tax is charged.';
    case 'intra':
      return `Client in your own state: the tax is split into CGST and ${totals.stateTaxLabel}, half each.`;
    case 'inter':
      return 'Client in another state: one integrated tax, IGST, at the full rate.';
    default:
      return '';
  }
}
