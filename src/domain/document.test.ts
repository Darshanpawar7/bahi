import { describe, expect, it } from 'vitest';
import { business, client, invoice, line, RUPEE } from '../testing/fixtures';
import { appDataSchema, backupFileName, MAX_BACKUP_BYTES, parseBackup, parseStored, serialiseBackup } from './backup';
import { buildInvoiceDocument, safeFilePart } from './document';
import {
  defaultBusiness,
  draftInvoice,
  duplicateInvoice,
  emptyClient,
  emptyData,
  emptyLine,
  emptyPayment,
} from './factory';
import { validateGstin } from './gstin';
import { sampleData } from './sample';
import { expectedTds, settlementOf, STATUS_LABEL, statusOf } from './status';
import { computeInvoice } from './tax';
import type { InvoiceStatus, Payment } from './types';
import { amountInWords, indianWords, internationalWords } from './words';

const TODAY = '2026-11-11';
const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'p1',
  date: '2026-11-05',
  amountPaise: 0,
  tdsPaise: 0,
  mode: 'upi',
  reference: '',
  ...overrides,
});

describe('amount in words', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [100, 'Rupees One Only'],
    [9900, 'Rupees Ninety-Nine Only'],
    [10_000, 'Rupees One Hundred Only'],
    [1_00_000, 'Rupees One Thousand Only'],
    [1_00_00_000, 'Rupees One Lakh Only'],
    [59_00_000, 'Rupees Fifty-Nine Thousand Only'],
    [12_345_678, 'Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight Paise Only'],
    [
      1_23_45_678_90,
      'Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Ninety Paise Only',
    ],
    [50, 'Fifty Paise Only'],
    [1905, 'Rupees Nineteen and Five Paise Only'],
    [100_00_00_000_00, 'Rupees One Hundred Crore Only'],
  ])('writes %d paise as "%s"', (paise, words) => {
    expect(amountInWords(paise)).toBe(words);
  });

  it('speaks the crore count as a number past ninety-nine crore', () => {
    expect(indianWords(12_345_678_901)).toBe(
      'One Thousand Two Hundred Thirty-Four Crore Fifty-Six Lakh Seventy-Eight Thousand Nine Hundred One',
    );
  });

  it('uses the international system and the right units for other currencies', () => {
    expect(amountInWords(123_450, 'USD')).toBe('US Dollars One Thousand Two Hundred Thirty-Four and Fifty Cents Only');
    expect(amountInWords(100_000_000, 'USD')).toBe('US Dollars One Million Only');
    expect(amountInWords(250_075, 'GBP')).toBe('Pounds Sterling Two Thousand Five Hundred and Seventy-Five Pence Only');
    expect(internationalWords(0)).toBe('Zero');
    expect(internationalWords(2_000_000_015)).toBe('Two Billion Fifteen');
  });

  it('never goes negative', () => {
    expect(amountInWords(-500)).toBe('Rupees Zero Only');
  });
});

describe('status and settlement', () => {
  const total = 59_000 * RUPEE;
  const check = (overrides: Parameters<typeof invoice>[0], expected: InvoiceStatus, today = TODAY) =>
    expect(statusOf(invoice(overrides), total, today)).toBe(expected);

  it('is a draft until it is sent', () => check({}, 'draft'));
  it('is sent while inside its due date', () => check({ sent: true, dueDate: '2026-11-16' }, 'sent'));
  it('is still only sent on the due date itself', () => check({ sent: true, dueDate: TODAY }, 'sent'));
  it('is overdue the day after the due date', () => check({ sent: true, dueDate: '2026-11-10' }, 'overdue'));
  it('is part paid when some money has arrived', () =>
    check({ sent: true, dueDate: '2026-11-16', payments: [payment({ amountPaise: 1000 })] }, 'partially-paid'));
  it('is overdue rather than part paid once the date has passed', () =>
    check({ sent: true, dueDate: '2026-11-01', payments: [payment({ amountPaise: 1000 })] }, 'overdue'));
  it('is paid when cash plus TDS covers the total', () =>
    check(
      {
        sent: true,
        dueDate: '2026-11-01',
        payments: [payment({ amountPaise: total - 5000 * RUPEE, tdsPaise: 5000 * RUPEE })],
      },
      'paid',
    ));
  it('is void whatever else is true', () =>
    check({ voided: true, sent: true, payments: [payment({ amountPaise: total })] }, 'void'));
  it('is not paid when the total is zero', () => expect(statusOf(invoice({ sent: true }), 0, TODAY)).toBe('sent'));

  it('adds up cash and TDS, and never reports a negative balance', () => {
    const settled = settlementOf(
      { payments: [payment({ amountPaise: 300, tdsPaise: 50 }), payment({ id: 'p2', amountPaise: 900 })] },
      1000,
    );
    expect(settled).toEqual({ received: 1200, tds: 50, settled: 1250, balance: 0 });
  });

  it('works out expected TDS on the taxable value only', () => {
    expect(expectedTds(50_000 * RUPEE, 10)).toBe(5000 * RUPEE);
    expect(expectedTds(50_000 * RUPEE, 0)).toBe(0);
    expect(expectedTds(50_000 * RUPEE, Number.NaN)).toBe(0);
    expect(expectedTds(1000, 250)).toBe(1000);
    expect(Object.keys(STATUS_LABEL)).toHaveLength(6);
  });
});

describe('the invoice document', () => {
  it('lays out an intra-state tax invoice', () => {
    const doc = buildInvoiceDocument(invoice({ sent: true }), business(), client(), TODAY);
    expect(doc.title).toBe('Tax Invoice');
    expect(doc.date).toBe('1 Nov 2026');
    expect(doc.placeOfSupply).toBe('Karnataka (29)');
    expect(doc.totals.map(row => row.label)).toEqual(['Taxable value', 'CGST 9%', 'SGST 9%', 'Total']);
    expect(doc.totals.at(-1)).toEqual({ label: 'Total', value: '₹59,000.00', kind: 'total' });
    expect(doc.amountInWords).toBe('Rupees Fifty-Nine Thousand Only');
    expect(doc.lines[0]).toMatchObject({
      no: '1',
      quantity: '1',
      rate: '50,000.00',
      gstRate: '18%',
      amount: '59,000.00',
    });
    expect(doc.taxSummary?.head).toEqual(['HSN/SAC', 'Taxable value', 'CGST', 'SGST', 'Total tax']);
    expect(doc.taxSummary?.rows[0]).toEqual(['998314', '50,000.00', '4,500.00 @ 9%', '4,500.00 @ 9%', '9,000.00']);
    expect(doc.upiUri).toContain('am=59000.00');
    expect(doc.stamp).toBeNull();
    expect(doc.fileName).toBe('INV-26-27-001_Monsoon-Labs-Private-Limited.pdf');
    expect(doc.supplier.facts.map(item => item.label)).toEqual(['GSTIN', 'PAN', 'State']);
  });

  it('shows one IGST row for another state, and a plain label when rates are mixed', () => {
    const other = client({ stateCode: '27' });
    const single = buildInvoiceDocument(invoice({ placeOfSupply: '27' }), business(), other, TODAY);
    expect(single.totals.map(row => row.label)).toEqual(['Taxable value', 'IGST 18%', 'Total']);
    expect(single.taxSummary?.head).toEqual(['HSN/SAC', 'Taxable value', 'IGST', 'Total tax']);
    const mixed = buildInvoiceDocument(
      invoice({ placeOfSupply: '27', lines: [line({ id: 'a' }), line({ id: 'b', gstRateBp: 500, sac: '' })] }),
      business(),
      other,
      TODAY,
    );
    expect(mixed.totals.map(row => row.label)).toContain('IGST');
    expect(mixed.taxSummary?.rows[1]?.[0]).toBe('—');
  });

  it('shows discount, round-off, payments and the balance', () => {
    const doc = buildInvoiceDocument(
      invoice({
        sent: true,
        lines: [line({ ratePaise: 10_041, quantity: 2.5, unit: 'hours', discount: { kind: 'flat', value: 100 } })],
        payments: [payment({ amountPaise: 10_000, tdsPaise: 500 })],
      }),
      business(),
      client(),
      TODAY,
    );
    expect(doc.totals.map(row => row.label)).toEqual([
      'Subtotal',
      'Discount',
      'Taxable value',
      'CGST 9%',
      'SGST 9%',
      'Round off',
      'Total',
      'Received',
      'TDS deducted',
      'Balance due',
    ]);
    expect(doc.lines[0]?.quantity).toBe('2.5 hours');
    expect(doc.lines[0]?.discount).toBe('1.00');
    expect(doc.showDiscount).toBe(true);
    expect(doc.balanceDue).toBeGreaterThan(0);
    expect(doc.upiUri).toContain(`am=${(doc.balanceDue / 100).toFixed(2)}`);
  });

  it('stamps paid, void and draft invoices and stops asking for money once paid', () => {
    const total = computeInvoice(invoice(), business(), client()).total;
    const paid = buildInvoiceDocument(
      invoice({ sent: true, payments: [payment({ amountPaise: total })] }),
      business(),
      client(),
      TODAY,
    );
    expect(paid.stamp).toBe('PAID');
    expect(paid.upiUri).toBeNull();
    expect(buildInvoiceDocument(invoice({ voided: true, sent: true }), business(), client(), TODAY).stamp).toBe('VOID');
    expect(buildInvoiceDocument(invoice({ voided: true, sent: true }), business(), client(), TODAY).upiUri).toBeNull();
    expect(buildInvoiceDocument(invoice(), business(), client(), TODAY).stamp).toBe('DRAFT');
  });

  it('lays out an export in dollars: no UPI, no place of supply, the export endorsement', () => {
    const abroad = client({ country: 'US', stateCode: '', gstin: '', name: 'Northwind Analytics Inc.' });
    const doc = buildInvoiceDocument(
      invoice({ currency: 'USD', sent: true, lines: [line({ ratePaise: 4500, quantity: 80, unit: 'hours' })] }),
      business(),
      abroad,
      TODAY,
    );
    expect(doc.totals.at(-1)?.value).toBe('$3,600.00');
    expect(doc.amountInWords).toBe('US Dollars Three Thousand Six Hundred Only');
    expect(doc.upiUri).toBeNull();
    expect(doc.placeOfSupply).toBe('');
    expect(doc.showTax).toBe(false);
    expect(doc.taxSummary).toBeNull();
    expect(doc.endorsements[0]).toContain('LETTER OF UNDERTAKING');
    expect(doc.recipient.facts.map(item => item.label)).toEqual(['Email']);
  });

  it('hides every GST detail for an unregistered supplier', () => {
    const doc = buildInvoiceDocument(invoice(), business({ registration: 'unregistered', upiId: '' }), client(), TODAY);
    expect(doc.title).toBe('Invoice');
    expect(doc.supplier.facts.map(item => item.label)).not.toContain('GSTIN');
    expect(doc.recipient.facts.map(item => item.label)).not.toContain('GSTIN');
    expect(doc.showSac).toBe(false);
    expect(doc.totals.map(row => row.label)).toEqual(['Subtotal', 'Total']);
    expect(doc.upiUri).toBeNull();
  });

  it('marks tax as payable by the recipient under reverse charge', () => {
    const doc = buildInvoiceDocument(invoice({ reverseCharge: true }), business(), client(), TODAY);
    expect(doc.totals.find(row => row.label.startsWith('CGST'))?.label).toContain('payable by recipient');
    expect(doc.totals.at(-1)?.value).toBe('₹50,000.00');
  });

  it('makes file names that cannot escape a folder', () => {
    expect(safeFilePart('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFilePart('Lighthouse & Co.')).toBe('Lighthouse-Co');
    expect(safeFilePart('***')).toBe('');
    expect(buildInvoiceDocument(invoice(), business(), client({ name: '///' }), TODAY).fileName).toBe(
      'INV-26-27-001_invoice.pdf',
    );
  });
});

describe('new records', () => {
  it('drafts an invoice with the next number, today and the usual terms', () => {
    const biz = business({ defaultDueDays: 30 });
    const draft = draftInvoice(biz, client({ stateCode: '27' }), ['INV/26-27/004'], TODAY);
    expect(draft).toMatchObject({
      number: 'INV/26-27/005',
      date: TODAY,
      dueDate: '2026-12-11',
      placeOfSupply: '27',
      sent: false,
    });
    expect(draft.lines).toHaveLength(1);
    expect(draftInvoice(biz, null, [], TODAY).placeOfSupply).toBe('29');
    expect(draftInvoice(biz, client({ country: 'US', stateCode: '' }), [], TODAY).placeOfSupply).toBe('29');
  });

  it('duplicates an invoice as a clean draft', () => {
    const source = invoice({ sent: true, payments: [payment({ amountPaise: 100 })] });
    const copy = duplicateInvoice(source, business(), [source.number], TODAY);
    expect(copy.number).toBe('INV/26-27/002');
    expect(copy.id).not.toBe(source.id);
    expect(copy.lines[0]?.id).not.toBe(source.lines[0]?.id);
    expect(copy).toMatchObject({ sent: false, voided: false, payments: [] });
  });

  it('starts everything else empty but valid', () => {
    expect(emptyData()).toEqual({ version: 1, business: null, clients: [], invoices: [], sample: false });
    expect(emptyClient().country).toBe('IN');
    expect(emptyLine(defaultBusiness()).gstRateBp).toBe(1800);
    expect(emptyPayment(TODAY, 500)).toMatchObject({ date: TODAY, amountPaise: 500, tdsPaise: 0 });
    expect(appDataSchema.safeParse({ ...emptyData(), business: defaultBusiness() }).success).toBe(true);
  });
});

describe('sample data', () => {
  const data = sampleData(TODAY);

  it('contains an invoice in every status', () => {
    const biz = data.business;
    if (!biz) throw new Error('sample business missing');
    const statuses = new Set(
      data.invoices.map(inv => {
        const cli = data.clients.find(candidate => candidate.id === inv.clientId);
        if (!cli) throw new Error('sample client missing');
        return statusOf(inv, computeInvoice(inv, biz, cli).total, TODAY);
      }),
    );
    expect([...statuses].sort()).toEqual(['draft', 'overdue', 'paid', 'partially-paid', 'sent', 'void']);
  });

  it('uses well-formed GSTINs, unique numbers and no future dates', () => {
    expect(validateGstin(data.business?.gstin ?? '').ok).toBe(true);
    for (const cli of data.clients.filter(candidate => candidate.gstin !== ''))
      expect(validateGstin(cli.gstin).ok).toBe(true);
    expect(new Set(data.invoices.map(inv => inv.number)).size).toBe(data.invoices.length);
    expect(data.invoices.every(inv => inv.date <= TODAY)).toBe(true);
    expect(data.invoices.flatMap(inv => inv.payments).every(pay => pay.date <= TODAY)).toBe(true);
    expect(data.sample).toBe(true);
  });

  it('spans two financial years and is the same every time for the same day', () => {
    expect(new Set(data.invoices.map(inv => inv.number.split('/')[1])).size).toBe(2);
    expect(sampleData(TODAY)).toEqual(data);
  });

  it('passes the same validation as an imported backup', () => {
    expect(appDataSchema.safeParse(data).success).toBe(true);
  });
});

describe('backups', () => {
  const data = sampleData(TODAY);

  it('round-trips through a backup file', () => {
    const result = parseBackup(serialiseBackup(data, '2026-11-11T10:00:00Z'));
    expect(result).toEqual({ ok: true, data });
    expect(backupFileName(TODAY)).toBe('bahi-backup-2026-11-11.json');
  });

  it.each([
    ['not json at all', 'not valid JSON'],
    ['{"app":"other","exportedAt":"x","data":{}}', 'not a Bahi backup'],
    ['[]', 'not a Bahi backup'],
    ['null', 'not a Bahi backup'],
  ])('rejects %j with a clear message', (fileText, message) => {
    const result = parseBackup(fileText);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(message);
  });

  it('rejects a file that is too large before parsing it', () => {
    const result = parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1));
    expect(result).toEqual({ ok: false, message: 'That file is too large to be a Bahi backup.' });
  });

  it('says where a tampered file went wrong', () => {
    const tampered = JSON.parse(serialiseBackup(data, 'now')) as { data: { invoices: Array<{ date: string }> } };
    const first = tampered.data.invoices[0];
    if (first) first.date = '11/11/2026';
    const result = parseBackup(JSON.stringify(tampered));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('data.invoices.0.date');
  });

  it('refuses a logo that is not an image, and drops unknown or dangerous keys', () => {
    const biz = { ...defaultBusiness(), logo: 'javascript:alert(1)' };
    expect(appDataSchema.safeParse({ ...emptyData(), business: biz }).success).toBe(false);
    const hostile = `{"app":"bahi","exportedAt":"now","data":{"version":1,"business":null,"clients":[],"invoices":[],"sample":false,"__proto__":{"polluted":true},"extra":1}}`;
    const result = parseBackup(hostile);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(Object.keys(result.data).sort()).toEqual(['business', 'clients', 'invoices', 'sample', 'version']);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('validates what comes back from storage too', () => {
    expect(parseStored(data)).toEqual(data);
    expect(parseStored({ version: 2 })).toBeNull();
    expect(parseStored('nonsense')).toBeNull();
  });
});
