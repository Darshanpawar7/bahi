import { describe, expect, it } from 'vitest';
import { business, client, invoice, line, RUPEE } from '../testing/fixtures';
import { financialYear } from './dates';
import { clientFigures, dueLabel, needsAttention, paymentMessage, summarise, viewInvoices } from './report';
import type { AppData, Invoice, Payment } from './types';

const TODAY = '2026-11-11';
const FY = financialYear(2026);
const TOTAL = 59_000 * RUPEE;

const pay = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'p',
  date: '2026-10-20',
  amountPaise: TOTAL,
  tdsPaise: 0,
  mode: 'upi',
  reference: '',
  ...overrides,
});

function data(invoices: Invoice[]): AppData {
  return {
    version: 1,
    business: business(),
    clients: [client(), client({ id: 'client-us', name: 'Northwind', country: 'US', stateCode: '', gstin: '' })],
    invoices,
    sample: false,
  };
}

describe('invoice views', () => {
  it('is empty until a business exists', () => {
    expect(viewInvoices({ ...data([invoice()]), business: null }, TODAY)).toEqual([]);
  });

  it('joins each invoice with its client, totals, status and balance', () => {
    const [view] = viewInvoices(data([invoice({ sent: true })]), TODAY);
    expect(view?.client.name).toBe('Monsoon Labs Private Limited');
    expect(view?.totals.total).toBe(TOTAL);
    expect(view?.status).toBe('sent');
    expect(view?.settlement.balance).toBe(TOTAL);
    expect(view?.toInr).toBe(1);
  });

  it('survives an invoice whose client has been removed', () => {
    const [view] = viewInvoices(data([invoice({ clientId: 'gone' })]), TODAY);
    expect(view?.client.name).toBe('No client chosen');
    expect(view?.totals.supplyType).toBe('intra');
  });
});

describe('financial-year summary', () => {
  const invoices = [
    invoice({ id: 'a', date: '2026-10-05', dueDate: '2026-10-20', sent: true, payments: [pay({ tdsPaise: 0 })] }),
    invoice({ id: 'b', date: '2026-10-25', dueDate: '2026-11-05', sent: true }),
    invoice({
      id: 'c',
      date: '2026-11-05',
      dueDate: '2026-11-20',
      sent: true,
      payments: [pay({ date: '2026-11-08', amountPaise: 10_000 * RUPEE, tdsPaise: 5000 * RUPEE })],
    }),
    invoice({ id: 'd', date: '2026-11-09', dueDate: '2026-11-24' }),
    invoice({ id: 'e', date: '2026-11-02', dueDate: '2026-11-17', sent: true, voided: true }),
    invoice({
      id: 'f',
      date: '2026-02-10',
      dueDate: '2026-02-25',
      sent: true,
      payments: [pay({ date: '2026-04-02' })],
    }),
    invoice({
      id: 'g',
      clientId: 'client-us',
      currency: 'USD',
      exchangeRate: 84,
      date: '2026-09-10',
      dueDate: '2026-10-10',
      sent: true,
      lines: [line({ ratePaise: 1000 * RUPEE })],
    }),
    invoice({
      id: 'h',
      clientId: 'client-us',
      currency: 'USD',
      exchangeRate: null,
      date: '2026-09-12',
      dueDate: '2026-10-12',
      sent: true,
    }),
  ];
  const summary = summarise(viewInvoices(data(invoices), TODAY), FY);

  it('counts invoices raised in the year, leaving out drafts, void ones and other years', () => {
    expect(summary.invoiced).toBe(TOTAL * 3 + 84_000 * RUPEE);
  });
  it('counts cash by the date it arrived, even for an invoice from last year', () => {
    expect(summary.received).toBe(TOTAL + 10_000 * RUPEE + TOTAL);
    expect(summary.tds).toBe(5000 * RUPEE);
  });
  it('reports what is owed today and how much of it is late', () => {
    const partBalance = TOTAL - 15_000 * RUPEE;
    expect(summary.outstanding).toBe(TOTAL + partBalance + 84_000 * RUPEE);
    expect(summary.overdue).toBe(TOTAL + 84_000 * RUPEE);
  });
  it('spreads the figures over the months from April', () => {
    expect(summary.months).toHaveLength(12);
    expect(summary.months.find(month => month.key === '2026-10')).toMatchObject({
      label: 'Oct',
      invoiced: TOTAL * 2,
      received: TOTAL,
    });
    expect(summary.months.find(month => month.key === '2026-04')?.received).toBe(TOTAL);
    expect(summary.months.find(month => month.key === '2026-09')?.invoiced).toBe(84_000 * RUPEE);
  });
  it('says how many foreign invoices it could not convert, instead of dropping them silently', () => {
    expect(summary.unconverted).toBe(1);
  });
});

describe('needs attention', () => {
  const views = viewInvoices(
    data([
      invoice({ id: 'late', dueDate: '2026-11-08', sent: true }),
      invoice({ id: 'soon', dueDate: '2026-11-15', sent: true }),
      invoice({ id: 'today', dueDate: TODAY, sent: true }),
      invoice({ id: 'far', dueDate: '2026-12-20', sent: true }),
      invoice({ id: 'draft', dueDate: '2026-11-01' }),
    ]),
    TODAY,
  );

  it('lists overdue and soon-due invoices, most urgent first', () => {
    expect(needsAttention(views, TODAY).map(item => [item.view.invoice.id, item.daysLeft])).toEqual([
      ['late', -3],
      ['today', 0],
      ['soon', 4],
    ]);
  });
  it('describes the wait in words', () => {
    expect(dueLabel(-3)).toBe('3 days overdue');
    expect(dueLabel(-1)).toBe('1 day overdue');
    expect(dueLabel(0)).toBe('due today');
    expect(dueLabel(1)).toBe('due in 1 day');
    expect(dueLabel(5)).toBe('due in 5 days');
  });
});

describe('per-client figures and messages', () => {
  const views = viewInvoices(
    data([
      invoice({ id: 'a', sent: true, payments: [pay({ amountPaise: 9000 * RUPEE })] }),
      invoice({ id: 'b' }),
      invoice({ id: 'c', clientId: 'client-us', currency: 'USD', exchangeRate: null, sent: true }),
    ]),
    TODAY,
  );

  it('totals billed and outstanding amounts per client', () => {
    const figures = clientFigures(views);
    expect(figures.get('client-1')).toEqual({ invoices: 2, billed: TOTAL, outstanding: TOTAL - 9000 * RUPEE });
    expect(figures.get('client-us')).toEqual({ invoices: 1, billed: 0, outstanding: 0 });
  });

  it('writes a short payment message, with the UPI ID only for rupee invoices', () => {
    const [rupees, , dollars] = views;
    if (!rupees || !dollars) throw new Error('fixture');
    const formatted = { amount: '₹59,000.00', due: '16 Nov 2026' };
    expect(paymentMessage(rupees, 'Kaveri Pixel Works', 'kaveripixel@examplebank', formatted)).toBe(
      'Hello, this is Kaveri Pixel Works. Invoice INV/26-27/001 for ₹59,000.00 is due on 16 Nov 2026. You can pay by UPI to kaveripixel@examplebank. Thank you.',
    );
    expect(paymentMessage(dollars, 'Kaveri Pixel Works', 'kaveripixel@examplebank', formatted)).not.toContain('UPI');
    expect(paymentMessage(rupees, 'Kaveri Pixel Works', '  ', formatted)).not.toContain('UPI');
  });
});
