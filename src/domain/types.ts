/** Money is always an integer number of paise (or cents). Never a float of rupees. */
export type Paise = number;

/** A GST rate in basis points: 18% is 1800. */
export type BasisPoints = number;

export type RegistrationType = 'regular' | 'composition' | 'unregistered';

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'SGD' | 'AED';

export type PaymentMode = 'upi' | 'bank' | 'cheque' | 'cash' | 'other';

export interface Numbering {
  /** Text before the financial year, for example "INV". */
  prefix: string;
  /** Minimum digits of the running number: 3 gives 001. */
  digits: number;
}

export interface Business {
  name: string;
  address: string;
  /** Two-digit GST state code, for example "29" for Karnataka. */
  stateCode: string;
  registration: RegistrationType;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  bankName: string;
  bankAccount: string;
  ifsc: string;
  upiId: string;
  /** Letter of Undertaking reference, printed on export invoices. */
  lutNumber: string;
  numbering: Numbering;
  defaultGstRateBp: BasisPoints;
  quickRatesBp: BasisPoints[];
  defaultDueDays: number;
  defaultTerms: string;
  /** Accent colour of the invoice, as a hex string. */
  accent: string;
  /** A small logo as a data URL, or an empty string. */
  logo: string;
}

export interface Client {
  id: string;
  name: string;
  address: string;
  /** ISO 3166-1 alpha-2. "IN" for India. */
  country: string;
  /** Two-digit GST state code. Empty for clients outside India. */
  stateCode: string;
  gstin: string;
  email: string;
}

export interface Discount {
  kind: 'percent' | 'flat';
  /** Percent as a plain number (10 means 10%), or a flat amount in paise. */
  value: number;
}

export interface LineItem {
  id: string;
  description: string;
  detail: string;
  /** HSN or SAC code. */
  sac: string;
  quantity: number;
  unit: string;
  ratePaise: Paise;
  discount: Discount | null;
  gstRateBp: BasisPoints;
}

export interface Payment {
  id: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  amountPaise: Paise;
  /** Tax deducted at source by the client. It settles the invoice just as cash does. */
  tdsPaise: Paise;
  mode: PaymentMode;
  reference: string;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  /** ISO dates, yyyy-mm-dd. */
  date: string;
  dueDate: string;
  /** GST state code of the place of supply. Ignored for exports. */
  placeOfSupply: string;
  currency: CurrencyCode;
  /** Rupees per one unit of the invoice currency. Only used for dashboard totals. */
  exchangeRate: number | null;
  lines: LineItem[];
  notes: string;
  terms: string;
  reverseCharge: boolean;
  pricesIncludeTax: boolean;
  /** Export invoices only: true charges IGST, false supplies under a Letter of Undertaking. */
  exportWithIgst: boolean;
  roundOff: boolean;
  sent: boolean;
  voided: boolean;
  payments: Payment[];
}

export type SupplyType = 'intra' | 'inter' | 'export' | 'untaxed';

export type InvoiceStatus = 'draft' | 'sent' | 'partially-paid' | 'paid' | 'overdue' | 'void';

export interface AppData {
  version: 1;
  business: Business | null;
  clients: Client[];
  invoices: Invoice[];
  /** True while the workspace still holds the generated sample data. */
  sample: boolean;
}
