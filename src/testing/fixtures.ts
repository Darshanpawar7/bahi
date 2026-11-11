import { defaultBusiness } from '../domain/factory';
import { makeGstin } from '../domain/gstin';
import type { Business, Client, Invoice, LineItem } from '../domain/types';

export const RUPEE = 100;

export function business(overrides: Partial<Business> = {}): Business {
  return {
    ...defaultBusiness(),
    name: 'Kaveri Pixel Works',
    address: '14, 3rd Cross\nBengaluru 560038',
    stateCode: '29',
    registration: 'regular',
    gstin: makeGstin('29', 'AAAPK0000A'),
    pan: 'AAAPK0000A',
    upiId: 'kaveripixel@examplebank',
    ...overrides,
  };
}

export function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    name: 'Monsoon Labs Private Limited',
    address: 'Koramangala\nBengaluru 560095',
    country: 'IN',
    stateCode: '29',
    gstin: makeGstin('29', 'AAACM0000A'),
    email: 'accounts@monsoonlabs.example',
    ...overrides,
  };
}

export function line(overrides: Partial<LineItem> = {}): LineItem {
  return {
    id: 'line-1',
    description: 'Website design and build',
    detail: '',
    sac: '998314',
    quantity: 1,
    unit: '',
    ratePaise: 50_000 * RUPEE,
    discount: null,
    gstRateBp: 1800,
    ...overrides,
  };
}

export function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'invoice-1',
    number: 'INV/26-27/001',
    clientId: 'client-1',
    date: '2026-11-01',
    dueDate: '2026-11-16',
    placeOfSupply: '29',
    currency: 'INR',
    exchangeRate: null,
    lines: [line()],
    notes: '',
    terms: '',
    reverseCharge: false,
    pricesIncludeTax: false,
    exportWithIgst: false,
    roundOff: true,
    sent: false,
    voided: false,
    payments: [],
    ...overrides,
  };
}
