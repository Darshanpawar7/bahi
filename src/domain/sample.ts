import { addDays } from './dates';
import { defaultBusiness } from './factory';
import { makeGstin } from './gstin';
import { nextInvoiceNumber } from './numbering';
import { computeInvoice } from './tax';
import type { AppData, Business, Client, Invoice, LineItem, Payment } from './types';

/**
 * A fictional studio with clients, invoices in every status and a few payments, so that a first-time
 * visitor sees a living workspace. Every name is invented. The GSTINs are well-formed (their check
 * characters are right) but are built on obviously fake PANs.
 * Dates are generated relative to `today`, so the sample never looks stale.
 */

const GST_18 = 1800;
const RUPEE = 100;

function sampleBusiness(): Business {
  return {
    ...defaultBusiness(),
    name: 'Kaveri Pixel Works',
    address: '14, 3rd Cross, Indiranagar\nBengaluru 560038',
    stateCode: '29',
    registration: 'regular',
    gstin: makeGstin('29', 'AAAPK0000A'),
    pan: 'AAAPK0000A',
    email: 'hello@kaveripixel.example',
    phone: '+91 80 5550 0142',
    bankName: 'Example Bank, Indiranagar',
    bankAccount: '0001 1122 2333',
    ifsc: 'EXMP0001234',
    upiId: 'kaveripixel@examplebank',
    lutNumber: 'AD290400000000X',
  };
}

function sampleClients(): Client[] {
  return [
    {
      id: 'client-monsoon',
      name: 'Monsoon Labs Private Limited',
      address: '2nd Floor, Lakeview Tech Park\nKoramangala, Bengaluru 560095',
      country: 'IN',
      stateCode: '29',
      gstin: makeGstin('29', 'AAACM0000A'),
      email: 'accounts@monsoonlabs.example',
    },
    {
      id: 'client-sahyadri',
      name: 'Sahyadri Outdoors LLP',
      address: '7 Hillside Lane, Baner\nPune 411045',
      country: 'IN',
      stateCode: '27',
      gstin: makeGstin('27', 'AAAFS0000B'),
      email: 'finance@sahyadrioutdoors.example',
    },
    {
      id: 'client-lighthouse',
      name: 'Lighthouse & Co.',
      address: '31 Beach Road, Besant Nagar\nChennai 600090',
      country: 'IN',
      stateCode: '33',
      gstin: makeGstin('33', 'AAACL0000C'),
      email: 'studio@lighthouseco.example',
    },
    {
      id: 'client-ananya',
      name: 'Ananya Rao',
      address: '9 Temple Street, Saraswathipuram\nMysuru 570009',
      country: 'IN',
      stateCode: '29',
      gstin: '',
      email: 'ananya.rao@mail.example',
    },
    {
      id: 'client-northwind',
      name: 'Northwind Analytics Inc.',
      address: '500 Example Avenue, Suite 210\nAustin, Texas 78701\nUnited States',
      country: 'US',
      stateCode: '',
      gstin: '',
      email: 'ap@northwindanalytics.example',
    },
  ];
}

type Service = Omit<LineItem, 'id' | 'discount' | 'gstRateBp'>;

const SERVICE = {
  brand: {
    description: 'Brand identity design',
    detail: 'Logo, colour, type and a guidelines page',
    sac: '998391',
    quantity: 1,
    unit: '',
    ratePaise: 85_000 * RUPEE,
  },
  website: {
    description: 'Website design and build',
    detail: 'Eight pages, content management, launch',
    sac: '998314',
    quantity: 1,
    unit: '',
    ratePaise: 1_40_000 * RUPEE,
  },
  retainer: {
    description: 'Monthly retainer',
    detail: 'Design and development support',
    sac: '998314',
    quantity: 1,
    unit: 'month',
    ratePaise: 45_000 * RUPEE,
  },
  photos: {
    description: 'Product photography',
    detail: 'Studio day, 40 retouched frames',
    sac: '998382',
    quantity: 2,
    unit: 'days',
    ratePaise: 18_000 * RUPEE,
  },
  audit: {
    description: 'UX audit',
    detail: 'Heuristic review and a prioritised fix list',
    sac: '998313',
    quantity: 1,
    unit: '',
    ratePaise: 60_000 * RUPEE,
  },
  dashboard: {
    description: 'Dashboard development',
    detail: 'React front end and reporting API',
    sac: '998314',
    quantity: 60,
    unit: 'hours',
    ratePaise: 1800 * RUPEE,
  },
  hosting: {
    description: 'Hosting and maintenance',
    detail: 'Managed hosting, backups and updates',
    sac: '998315',
    quantity: 6,
    unit: 'months',
    ratePaise: 1500 * RUPEE,
  },
  portrait: {
    description: 'Portfolio website',
    detail: 'One-page site with a contact form',
    sac: '998314',
    quantity: 1,
    unit: '',
    ratePaise: 28_000 * RUPEE,
  },
  analytics: {
    description: 'Analytics dashboard build',
    detail: 'Billed hourly, in US dollars',
    sac: '998314',
    quantity: 80,
    unit: 'hours',
    ratePaise: 45 * RUPEE,
  },
} satisfies Record<string, Service>;

type Outcome = 'paid' | 'paid-with-tds' | 'part-paid' | 'sent' | 'draft' | 'void';

interface Spec {
  client: string;
  /** Days before today that the invoice was raised. */
  daysAgo: number;
  dueIn: number;
  services: Service[];
  outcome: Outcome;
  usd?: boolean;
}

/** Oldest first. The mix guarantees every status, including overdue ones (sent long ago, never paid). */
const SPECS: readonly Spec[] = [
  { client: 'client-monsoon', daysAgo: 395, dueIn: 15, services: [SERVICE.brand], outcome: 'paid' },
  { client: 'client-sahyadri', daysAgo: 340, dueIn: 30, services: [SERVICE.website], outcome: 'paid-with-tds' },
  { client: 'client-lighthouse', daysAgo: 300, dueIn: 15, services: [SERVICE.photos], outcome: 'paid' },
  { client: 'client-monsoon', daysAgo: 250, dueIn: 15, services: [SERVICE.retainer], outcome: 'paid' },
  { client: 'client-northwind', daysAgo: 205, dueIn: 30, services: [SERVICE.analytics], outcome: 'paid', usd: true },
  { client: 'client-monsoon', daysAgo: 160, dueIn: 15, services: [SERVICE.retainer, SERVICE.hosting], outcome: 'paid' },
  { client: 'client-ananya', daysAgo: 128, dueIn: 7, services: [SERVICE.portrait], outcome: 'paid' },
  { client: 'client-sahyadri', daysAgo: 96, dueIn: 30, services: [SERVICE.dashboard], outcome: 'paid-with-tds' },
  { client: 'client-lighthouse', daysAgo: 74, dueIn: 15, services: [SERVICE.audit], outcome: 'sent' },
  { client: 'client-monsoon', daysAgo: 52, dueIn: 15, services: [SERVICE.retainer], outcome: 'paid' },
  { client: 'client-northwind', daysAgo: 33, dueIn: 30, services: [SERVICE.analytics], outcome: 'sent', usd: true },
  {
    client: 'client-sahyadri',
    daysAgo: 21,
    dueIn: 30,
    services: [SERVICE.brand, SERVICE.photos],
    outcome: 'part-paid',
  },
  { client: 'client-lighthouse', daysAgo: 9, dueIn: 15, services: [SERVICE.website], outcome: 'void' },
  { client: 'client-monsoon', daysAgo: 4, dueIn: 15, services: [SERVICE.retainer], outcome: 'sent' },
  { client: 'client-ananya', daysAgo: 1, dueIn: 7, services: [SERVICE.audit], outcome: 'draft' },
];

const USD_TO_INR = 84;
const TDS_PERCENT = 10;

function paymentsFor(
  outcome: Outcome,
  invoice: Invoice,
  business: Business,
  client: Client,
  paidAfterDays: number,
): Payment[] {
  const totals = computeInvoice(invoice, business, client);
  const base = { id: `${invoice.id}-payment`, date: addDays(invoice.date, paidAfterDays), reference: '' };
  switch (outcome) {
    case 'paid':
      return [{ ...base, amountPaise: totals.total, tdsPaise: 0, mode: invoice.currency === 'INR' ? 'upi' : 'bank' }];
    case 'paid-with-tds': {
      const tds = Math.round((totals.taxable * TDS_PERCENT) / 100);
      return [{ ...base, amountPaise: totals.total - tds, tdsPaise: tds, mode: 'bank', reference: 'NEFT' }];
    }
    case 'part-paid':
      return [{ ...base, amountPaise: Math.round(totals.total / 2 / RUPEE) * RUPEE, tdsPaise: 0, mode: 'upi' }];
    default:
      return [];
  }
}

export function sampleData(today: string): AppData {
  const business = sampleBusiness();
  const clients = sampleClients();
  const invoices: Invoice[] = [];
  SPECS.forEach((spec, index) => {
    const client = clients.find(candidate => candidate.id === spec.client);
    if (!client) return;
    const date = addDays(today, -spec.daysAgo);
    const draft: Invoice = {
      id: `sample-${String(index + 1).padStart(2, '0')}`,
      number: nextInvoiceNumber(
        business.numbering,
        invoices.map(invoice => invoice.number),
        date,
      ),
      clientId: client.id,
      date,
      dueDate: addDays(date, spec.dueIn),
      placeOfSupply: client.country === 'IN' ? client.stateCode : business.stateCode,
      currency: spec.usd ? 'USD' : 'INR',
      exchangeRate: spec.usd ? USD_TO_INR : null,
      lines: spec.services.map((service, line) => ({
        ...service,
        id: `sample-${index + 1}-line-${line + 1}`,
        discount: null,
        gstRateBp: GST_18,
      })),
      notes: '',
      terms: business.defaultTerms,
      reverseCharge: false,
      pricesIncludeTax: false,
      exportWithIgst: false,
      roundOff: true,
      sent: spec.outcome !== 'draft',
      voided: spec.outcome === 'void',
      payments: [],
    };
    // Paid between 3 and 10 days after the invoice date, never in the future.
    const paidAfterDays = Math.min(3 + ((index * 3) % 8), spec.daysAgo);
    invoices.push({ ...draft, payments: paymentsFor(spec.outcome, draft, business, client, paidAfterDays) });
  });
  return { version: 1, business, clients, invoices, sample: true };
}
