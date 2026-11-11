import { addDays } from './dates';
import { nextInvoiceNumber } from './numbering';
import type { AppData, Business, Client, Invoice, LineItem, Payment } from './types';

export const DEFAULT_ACCENT = '#B4321F';
const GST_18 = 1800;

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyData(): AppData {
  return { version: 1, business: null, clients: [], invoices: [], sample: false };
}

export function defaultBusiness(): Business {
  return {
    name: '',
    address: '',
    stateCode: '29',
    registration: 'regular',
    gstin: '',
    pan: '',
    email: '',
    phone: '',
    bankName: '',
    bankAccount: '',
    ifsc: '',
    upiId: '',
    lutNumber: '',
    numbering: { prefix: 'INV', digits: 3 },
    defaultGstRateBp: GST_18,
    quickRatesBp: [0, 500, 1800, 4000],
    defaultDueDays: 15,
    defaultTerms: 'Payment is due by the date shown above. Thank you for your business.',
    accent: DEFAULT_ACCENT,
    logo: '',
  };
}

export function emptyClient(): Client {
  return { id: newId(), name: '', address: '', country: 'IN', stateCode: '29', gstin: '', email: '' };
}

export function emptyLine(business: Pick<Business, 'defaultGstRateBp'>): LineItem {
  return {
    id: newId(),
    description: '',
    detail: '',
    sac: '',
    quantity: 1,
    unit: '',
    ratePaise: 0,
    discount: null,
    gstRateBp: business.defaultGstRateBp,
  };
}

export function emptyPayment(date: string, amountPaise: number): Payment {
  return { id: newId(), date, amountPaise, tdsPaise: 0, mode: 'upi', reference: '' };
}

/** A fresh draft for a client, numbered, dated today and due by the business's usual terms. */
export function draftInvoice(
  business: Business,
  client: Client | null,
  existingNumbers: readonly string[],
  today: string,
): Invoice {
  return {
    id: newId(),
    number: nextInvoiceNumber(business.numbering, existingNumbers, today),
    clientId: client?.id ?? '',
    date: today,
    dueDate: addDays(today, business.defaultDueDays),
    placeOfSupply: client && client.country === 'IN' ? client.stateCode : business.stateCode,
    currency: 'INR',
    exchangeRate: null,
    lines: [emptyLine(business)],
    notes: '',
    terms: business.defaultTerms,
    reverseCharge: false,
    pricesIncludeTax: false,
    exportWithIgst: false,
    roundOff: true,
    sent: false,
    voided: false,
    payments: [],
  };
}

/** A copy of an invoice as a new draft: new ids, new number, today's dates, no payments. */
export function duplicateInvoice(
  source: Invoice,
  business: Business,
  existingNumbers: readonly string[],
  today: string,
): Invoice {
  return {
    ...source,
    id: newId(),
    number: nextInvoiceNumber(business.numbering, existingNumbers, today),
    date: today,
    dueDate: addDays(today, business.defaultDueDays),
    lines: source.lines.map(line => ({ ...line, id: newId() })),
    sent: false,
    voided: false,
    payments: [],
  };
}
