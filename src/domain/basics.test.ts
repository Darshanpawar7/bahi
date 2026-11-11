import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  financialYear,
  financialYearOf,
  formatDate,
  isIsoDate,
  monthKey,
  monthsOf,
  todayIso,
} from './dates';
import { gstinCheckCharacter, isValidPan, makeGstin, normaliseGstin, validateGstin } from './gstin';
import {
  exclusiveOf,
  formatAmount,
  formatCompactRupees,
  formatMoney,
  formatRate,
  halfShareOf,
  lineAmount,
  parseMoney,
  portion,
  shareOf,
  toMilliUnits,
} from './money';
import { formatInvoiceNumber, invoiceNumberProblem, nextInvoiceNumber, sequenceOf } from './numbering';
import { searchSac, SAC_SUGGESTIONS } from './sac';
import { isStateCode, placeOfSupplyLabel, stateName, stateTaxLabel, STATES } from './states';
import { isValidVpa, upiUri } from './upi';

describe('GSTIN', () => {
  it.each(['27AAPFU0939F1ZV', '29AAGCB7383J1Z4', '07AAGFF2194N1Z1', '24AAACC1206D1ZM', '27AAACR5055K1Z7'])(
    'accepts the real, published GSTIN %s',
    gstin => {
      const result = validateGstin(gstin);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.stateCode).toBe(gstin.slice(0, 2));
        expect(result.pan).toBe(gstin.slice(2, 12));
      }
    },
  );

  it('computes the check character from the first fourteen', () => {
    expect(gstinCheckCharacter('27AAPFU0939F1Z')).toBe('V');
    expect(gstinCheckCharacter('29AAGCB7383J1Z')).toBe('4');
  });

  it('normalises lower case and stray spaces before checking', () => {
    expect(normaliseGstin(' 27aapfu0939f1zv ')).toBe('27AAPFU0939F1ZV');
    expect(validateGstin('27aapfu 0939f1zv').ok).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['27AAPFU0939F1Z', 'length'],
    ['27AAPFU0939F1ZVX', 'length'],
    ['27AAPFU0939F1YV', 'shape'],
    ['2AAAPFU0939F1ZV', 'shape'],
    ['99AAPFU0939F1ZV', 'state'],
    ['27AAPFU0939F1ZW', 'checksum'],
    ['27AAPFU0939G1ZV', 'checksum'],
  ])('rejects %j as a %s problem, with a message a person can act on', (input, problem) => {
    const result = validateGstin(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem).toBe(problem);
      expect(result.message.length).toBeGreaterThan(10);
    }
  });

  it('builds sample GSTINs that pass its own validation', () => {
    expect(validateGstin(makeGstin('29', 'AAAPK0000A')).ok).toBe(true);
    expect(validateGstin(makeGstin('27', 'aaafs0000b', '2')).ok).toBe(true);
  });

  it('checks the shape of a PAN', () => {
    expect(isValidPan('AAAPK0000A')).toBe(true);
    expect(isValidPan(' aaapk0000a ')).toBe(true);
    expect(isValidPan('AAAPK000A')).toBe(false);
    expect(isValidPan('1AAPK0000A')).toBe(false);
  });
});

describe('states', () => {
  it('knows every GST state code once', () => {
    expect(STATES).toHaveLength(37);
    expect(new Set(STATES.map(state => state.code)).size).toBe(37);
    expect(isStateCode('29')).toBe(true);
    expect(isStateCode('25')).toBe(false);
    expect(isStateCode('00')).toBe(false);
  });
  it('prints a place of supply as name and code', () => {
    expect(placeOfSupplyLabel('29')).toBe('Karnataka (29)');
    expect(placeOfSupplyLabel('xx')).toBe('');
    expect(stateName('07')).toBe('Delhi');
  });
  it('uses UTGST only for union territories without a legislature', () => {
    expect(['04', '26', '31', '35', '38', '97'].map(stateTaxLabel)).toEqual(Array(6).fill('UTGST'));
    expect(['07', '34', '01', '29', '36'].map(stateTaxLabel)).toEqual(Array(5).fill('SGST'));
  });
});

describe('money', () => {
  it('converts quantities to thousandths and ignores nonsense', () => {
    expect(toMilliUnits(2.5)).toBe(2500n);
    expect(toMilliUnits(-1)).toBe(0n);
    expect(toMilliUnits(Number.NaN)).toBe(0n);
  });
  it('multiplies on integers, even for very large amounts', () => {
    expect(lineAmount(1_000_000, 9_007_199_254)).toBe(9_007_199_254_000_000);
    expect(lineAmount(2, -500)).toBe(0);
  });
  it('takes shares in basis points, rounding half up', () => {
    expect(shareOf(10_000, 1800)).toBe(1800);
    expect(shareOf(333, 1800)).toBe(60); // 59.94
    expect(shareOf(25, 200)).toBe(1); // exactly 0.5 rounds up
    expect(halfShareOf(10_040, 1800)).toBe(904);
    expect(shareOf(0, 1800)).toBe(0);
    expect(shareOf(100, 0)).toBe(0);
    expect(portion(100, 1, 0)).toBe(0);
  });
  it('removes tax from an inclusive amount', () => {
    expect(exclusiveOf(11_800, 1800)).toBe(10_000);
    expect(exclusiveOf(10_000, 0)).toBe(10_000);
    expect(exclusiveOf(0, 1800)).toBe(0);
  });
  it('parses what people type into a money field', () => {
    expect(parseMoney('1,23,456.50')).toBe(12_345_650);
    expect(parseMoney('₹ 500')).toBe(50_000);
    expect(parseMoney('0.5')).toBe(50);
    expect(parseMoney('.75')).toBe(75);
    expect(parseMoney('12.')).toBe(1200);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('.')).toBeNull();
    expect(parseMoney('12.345')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
  });
  it('groups rupees the Indian way and other currencies the usual way', () => {
    expect(formatAmount(12_345_678)).toBe('1,23,456.78');
    expect(formatMoney(5_900_000)).toBe('₹59,000.00');
    expect(formatMoney(-4800)).toBe('−₹48.00');
    expect(formatMoney(123_456_789, 'USD')).toBe('$1,234,567.89');
    expect(formatMoney(100, 'AED')).toBe('AED 1.00');
  });
  it('shortens big figures for chart axes', () => {
    expect(formatCompactRupees(50_000)).toBe('₹500');
    expect(formatCompactRupees(4_500_000)).toBe('₹45k');
    expect(formatCompactRupees(15_000_000)).toBe('₹1.5L');
    expect(formatCompactRupees(2_500_000_000)).toBe('₹2.5Cr');
    expect(formatCompactRupees(12_000_000_000)).toBe('₹12Cr');
  });
  it('prints rates without trailing zeros', () => {
    expect(formatRate(1800)).toBe('18%');
    expect(formatRate(25)).toBe('0.25%');
    expect(formatRate(150)).toBe('1.5%');
    expect(formatRate(0)).toBe('0%');
  });
});

describe('dates and the financial year', () => {
  it('ends a financial year on 31 March and starts the next on 1 April', () => {
    expect(financialYearOf('2026-03-31').label).toBe('2025-26');
    expect(financialYearOf('2026-04-01').label).toBe('2026-27');
    expect(financialYearOf('2026-11-11')).toEqual({
      startYear: 2026,
      label: '2026-27',
      short: '26-27',
      start: '2026-04-01',
      end: '2027-03-31',
    });
    expect(financialYear(1999).label).toBe('1999-00');
  });
  it('lists the twelve months from April to March', () => {
    const months = monthsOf(financialYear(2026));
    expect(months.map(month => month.label).join(' ')).toBe('Apr May Jun Jul Aug Sep Oct Nov Dec Jan Feb Mar');
    expect(months[0]?.key).toBe('2026-04');
    expect(months[11]?.key).toBe('2027-03');
    expect(monthKey('2026-11-11')).toBe('2026-11');
  });
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-11-25', 15)).toBe('2026-12-10');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-01', '2026-11-16')).toBe(15);
    expect(daysBetween('2026-11-16', '2026-11-01')).toBe(-15);
  });
  it('recognises real dates only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
  it('formats dates for people', () => {
    expect(formatDate('2026-11-05')).toBe('5 Nov 2026');
    expect(formatDate('not a date')).toBe('');
    expect(todayIso(new Date(2026, 10, 11, 23, 59))).toBe('2026-11-11');
  });
});

describe('invoice numbers', () => {
  const numbering = { prefix: 'INV', digits: 3 };
  const fy = financialYear(2026);

  it('joins prefix, financial year and a padded running number', () => {
    expect(formatInvoiceNumber(numbering, fy, 1)).toBe('INV/26-27/001');
    expect(formatInvoiceNumber({ prefix: '', digits: 2 }, fy, 7)).toBe('26-27/07');
    expect(formatInvoiceNumber(numbering, fy, 1234)).toBe('INV/26-27/1234');
  });
  it('reads the running number back, and only from its own series', () => {
    expect(sequenceOf('INV/26-27/007', numbering, fy)).toBe(7);
    expect(sequenceOf('INV/25-26/007', numbering, fy)).toBeNull();
    expect(sequenceOf('INV/26-27/7a', numbering, fy)).toBeNull();
    expect(sequenceOf('26-27/04', { prefix: '', digits: 2 }, fy)).toBe(4);
  });
  it('continues after the highest number used this financial year', () => {
    const existing = ['INV/26-27/001', 'INV/26-27/007', 'INV/25-26/030', 'custom'];
    expect(nextInvoiceNumber(numbering, existing, '2026-11-11')).toBe('INV/26-27/008');
  });
  it('restarts at one in a new financial year', () => {
    expect(nextInvoiceNumber(numbering, ['INV/26-27/041'], '2027-04-01')).toBe('INV/27-28/001');
    expect(nextInvoiceNumber(numbering, [], '2026-11-11')).toBe('INV/26-27/001');
  });
  it('enforces the legal shape only for GST-registered suppliers', () => {
    expect(invoiceNumberProblem('INV/26-27/001', true, [])).toBeNull();
    expect(invoiceNumberProblem('', true, [])).toMatch(/number/);
    expect(invoiceNumberProblem('INV/26-27/001', true, ['INV/26-27/001'])).toMatch(/already/);
    expect(invoiceNumberProblem('INVOICE/2026-27/001', true, [])).toMatch(/16/);
    expect(invoiceNumberProblem('INV 26-27 #1', true, [])).toMatch(/letters/);
    expect(invoiceNumberProblem('Invoice #1 for November', false, [])).toBeNull();
  });
});

describe('UPI and SAC', () => {
  it('builds a UPI link with a two-decimal amount and encoded text', () => {
    expect(
      upiUri({
        vpa: 'kaveripixel@examplebank',
        payeeName: 'Kaveri Pixel Works',
        amountPaise: 5_900_000,
        note: 'INV/26-27/001',
      }),
    ).toBe('upi://pay?pa=kaveripixel@examplebank&pn=Kaveri%20Pixel%20Works&am=59000.00&cu=INR&tn=INV%2F26-27%2F001');
    expect(upiUri({ vpa: ' a.b@bank ', payeeName: 'A & B', amountPaise: 50, note: '' })).toBe(
      'upi://pay?pa=a.b@bank&pn=A%20%26%20B&am=0.50&cu=INR&tn=',
    );
  });
  it('recognises a virtual payment address', () => {
    expect(isValidVpa('name@bank')).toBe(true);
    expect(isValidVpa('first.last-1@okaxis')).toBe(true);
    expect(isValidVpa('name')).toBe(false);
    expect(isValidVpa('name@')).toBe(false);
    expect(isValidVpa('na me@bank')).toBe(false);
  });
  it('suggests service codes by number or by words', () => {
    expect(searchSac('')).toHaveLength(6);
    expect(searchSac('9983', 50).every(item => item.code.startsWith('9983'))).toBe(true);
    expect(searchSac('photo').map(item => item.code)).toEqual(['998382', '998383']);
    expect(searchSac('zzz')).toEqual([]);
    expect(new Set(SAC_SUGGESTIONS.map(item => item.code)).size).toBe(SAC_SUGGESTIONS.length);
    expect(SAC_SUGGESTIONS.every(item => /^99\d{4}$/.test(item.code))).toBe(true);
  });
});
