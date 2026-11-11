import { describe, expect, it } from 'vitest';
import { business, client, invoice, line, RUPEE } from '../testing/fixtures';
import { computeInvoice, computeLine, documentTitle, endorsements, ENDORSEMENT, explainTax, supplyTypeOf } from './tax';

const FEE = 50_000 * RUPEE;

describe('supply type', () => {
  it('is intra-state when the supplier state equals the place of supply', () => {
    expect(supplyTypeOf(business(), client(), '29')).toBe('intra');
  });
  it('is inter-state when the place of supply is another state', () => {
    expect(supplyTypeOf(business(), client({ stateCode: '27' }), '27')).toBe('inter');
  });
  it('is an export when the client is outside India', () => {
    expect(supplyTypeOf(business(), client({ country: 'US' }), '29')).toBe('export');
  });
  it('is untaxed for composition and unregistered suppliers, wherever the client is', () => {
    expect(supplyTypeOf(business({ registration: 'composition' }), client(), '29')).toBe('untaxed');
    expect(supplyTypeOf(business({ registration: 'unregistered' }), client({ country: 'US' }), '29')).toBe('untaxed');
  });
});

describe('the worked example: a fee of Rs 50,000 at 18%', () => {
  it('splits tax into equal CGST and SGST for a client in the same state', () => {
    const totals = computeInvoice(invoice(), business(), client());
    expect(totals.supplyType).toBe('intra');
    expect(totals.taxable).toBe(FEE);
    expect(totals.cgst).toBe(4500 * RUPEE);
    expect(totals.sgst).toBe(4500 * RUPEE);
    expect(totals.igst).toBe(0);
    expect(totals.total).toBe(59_000 * RUPEE);
    expect(totals.stateTaxLabel).toBe('SGST');
  });

  it('charges one IGST for a client in another state', () => {
    const totals = computeInvoice(invoice({ placeOfSupply: '27' }), business(), client({ stateCode: '27' }));
    expect(totals.supplyType).toBe('inter');
    expect(totals.cgst).toBe(0);
    expect(totals.igst).toBe(9000 * RUPEE);
    expect(totals.total).toBe(59_000 * RUPEE);
  });

  it('charges nothing on an export under a Letter of Undertaking', () => {
    const totals = computeInvoice(invoice(), business(), client({ country: 'US', stateCode: '' }));
    expect(totals.supplyType).toBe('export');
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(FEE);
  });

  it('charges IGST on an export made on payment of integrated tax', () => {
    const totals = computeInvoice(invoice({ exportWithIgst: true }), business(), client({ country: 'US' }));
    expect(totals.igst).toBe(9000 * RUPEE);
    expect(totals.total).toBe(59_000 * RUPEE);
  });

  it('charges no tax for a composition supplier', () => {
    const totals = computeInvoice(invoice(), business({ registration: 'composition' }), client());
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(FEE);
    expect(totals.lines[0]?.rateBp).toBe(0);
  });

  it('charges no tax for an unregistered supplier', () => {
    const totals = computeInvoice(invoice(), business({ registration: 'unregistered' }), client());
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(FEE);
  });
});

describe('union territories', () => {
  it.each(['04', '26', '31', '35', '38', '97'])('labels the state half UTGST for place of supply %s', code => {
    const totals = computeInvoice(
      invoice({ placeOfSupply: code }),
      business({ stateCode: code }),
      client({ stateCode: code }),
    );
    expect(totals.supplyType).toBe('intra');
    expect(totals.stateTaxLabel).toBe('UTGST');
  });
  it.each(['07', '34', '01', '29'])('keeps SGST for %s, which has a legislature', code => {
    const totals = computeInvoice(
      invoice({ placeOfSupply: code }),
      business({ stateCode: code }),
      client({ stateCode: code }),
    );
    expect(totals.stateTaxLabel).toBe('SGST');
  });
});

describe('reverse charge', () => {
  it('shows the tax but does not add it to the amount payable', () => {
    const totals = computeInvoice(invoice({ reverseCharge: true }), business(), client());
    expect(totals.tax).toBe(9000 * RUPEE);
    expect(totals.taxCharged).toBe(0);
    expect(totals.total).toBe(FEE);
  });
  it('has no effect on an export', () => {
    const totals = computeInvoice(
      invoice({ reverseCharge: true, exportWithIgst: true }),
      business(),
      client({ country: 'US' }),
    );
    expect(totals.taxCharged).toBe(9000 * RUPEE);
  });
});

describe('lines', () => {
  const intra = { supplyType: 'intra', pricesIncludeTax: false, exportWithIgst: false } as const;

  it('multiplies quantity and rate exactly, without float drift', () => {
    expect(computeLine(line({ quantity: 3, ratePaise: 3333, gstRateBp: 0 }), intra).gross).toBe(9999);
    expect(computeLine(line({ quantity: 0.333, ratePaise: 10_000, gstRateBp: 0 }), intra).gross).toBe(3330);
  });

  it('rounds half a paisa up', () => {
    expect(computeLine(line({ quantity: 1.005, ratePaise: 100, gstRateBp: 0 }), intra).gross).toBe(101);
  });

  it('applies a percentage discount before tax', () => {
    const result = computeLine(line({ ratePaise: 10_000, discount: { kind: 'percent', value: 10 } }), intra);
    expect(result.discount).toBe(1000);
    expect(result.taxable).toBe(9000);
    expect(result.cgst).toBe(810);
    expect(result.total).toBe(9000 + 1620);
  });

  it('caps a flat discount at the line amount and a percentage at 100', () => {
    expect(computeLine(line({ ratePaise: 10_000, discount: { kind: 'flat', value: 99_999 } }), intra).taxable).toBe(0);
    expect(computeLine(line({ ratePaise: 10_000, discount: { kind: 'percent', value: 250 } }), intra).taxable).toBe(0);
  });

  it('ignores a zero or negative discount', () => {
    expect(computeLine(line({ ratePaise: 10_000, discount: { kind: 'flat', value: 0 } }), intra).discount).toBe(0);
  });

  it('keeps CGST and SGST equal even for a quarter-percent rate', () => {
    const result = computeLine(line({ ratePaise: 10_000 * RUPEE, gstRateBp: 25 }), intra);
    expect(result.cgst).toBe(1250);
    expect(result.sgst).toBe(1250);
  });

  it('backs the tax out of a tax-inclusive price', () => {
    const inclusive = { ...intra, pricesIncludeTax: true };
    const exact = computeLine(line({ ratePaise: 11_800 }), inclusive);
    expect(exact.taxable).toBe(10_000);
    expect(exact.cgst).toBe(900);
    expect(exact.total).toBe(11_800);
    // Rs 100.00 inclusive cannot be split into two equal halves exactly: the halves stay equal and the
    // line lands within one paisa of the price.
    const awkward = computeLine(line({ ratePaise: 10_000 }), inclusive);
    expect(awkward.cgst).toBe(awkward.sgst);
    expect(Math.abs(awkward.total - 10_000)).toBeLessThanOrEqual(1);
  });

  it('treats a tax-inclusive price as the price itself when no tax applies', () => {
    const result = computeLine(line({ ratePaise: 11_800 }), {
      supplyType: 'untaxed',
      pricesIncludeTax: true,
      exportWithIgst: false,
    });
    expect(result.taxable).toBe(11_800);
  });
});

describe('totals', () => {
  it('adds lines at different rates', () => {
    const totals = computeInvoice(
      invoice({
        lines: [
          line({ id: 'a', ratePaise: 1000 * RUPEE, gstRateBp: 500 }),
          line({ id: 'b', ratePaise: 2000 * RUPEE, gstRateBp: 1800 }),
        ],
      }),
      business(),
      client(),
    );
    expect(totals.cgst).toBe(2500 + 18_000);
    expect(totals.sgst).toBe(2500 + 18_000);
    expect(totals.taxable).toBe(3000 * RUPEE);
    expect(totals.total).toBe(3000 * RUPEE + 41_000);
  });

  it('rounds the total to the nearest rupee and shows the difference', () => {
    const down = computeInvoice(invoice({ lines: [line({ ratePaise: 10_040 })] }), business(), client());
    expect(down.cgst).toBe(904);
    expect(down.total).toBe(11_800);
    expect(down.roundOff).toBe(-48);
    const up = computeInvoice(invoice({ lines: [line({ ratePaise: 11_850, gstRateBp: 0 })] }), business(), client());
    expect(up.total).toBe(11_900);
    expect(up.roundOff).toBe(50);
  });

  it('does not round when rounding is off, or for a foreign-currency invoice', () => {
    const exact = computeInvoice(
      invoice({ roundOff: false, lines: [line({ ratePaise: 10_040 })] }),
      business(),
      client(),
    );
    expect(exact.total).toBe(11_848);
    expect(exact.roundOff).toBe(0);
    const usd = computeInvoice(
      invoice({ currency: 'USD', lines: [line({ ratePaise: 10_040 })] }),
      business(),
      client({ country: 'US' }),
    );
    expect(usd.total).toBe(10_040);
  });

  it('summarises tax by HSN/SAC code and rate', () => {
    const totals = computeInvoice(
      invoice({
        lines: [
          line({ id: 'a', sac: '998314', ratePaise: 1000 * RUPEE }),
          line({ id: 'b', sac: ' 998314 ', ratePaise: 500 * RUPEE }),
          line({ id: 'c', sac: '998391', ratePaise: 200 * RUPEE }),
          line({ id: 'd', sac: '998314', ratePaise: 100 * RUPEE, gstRateBp: 500 }),
        ],
      }),
      business(),
      client(),
    );
    expect(totals.groups).toHaveLength(3);
    expect(totals.groups[0]).toMatchObject({ sac: '998314', rateBp: 1800, taxable: 1500 * RUPEE, cgst: 13_500 });
    expect(totals.groups.reduce((sum, group) => sum + group.cgst + group.sgst, 0)).toBe(totals.tax);
  });

  it('handles an invoice with no lines', () => {
    const totals = computeInvoice(invoice({ lines: [] }), business(), client());
    expect(totals.total).toBe(0);
    expect(totals.groups).toEqual([]);
  });
});

describe('titles, endorsements and the plain-words explanation', () => {
  it('titles the document by registration', () => {
    expect(documentTitle(business())).toBe('Tax Invoice');
    expect(documentTitle(business({ registration: 'composition' }))).toBe('Bill of Supply');
    expect(documentTitle(business({ registration: 'unregistered' }))).toBe('Invoice');
  });

  it('prints the statements each kind of invoice must carry', () => {
    expect(endorsements(invoice(), business(), 'intra')).toEqual([]);
    expect(endorsements(invoice({ reverseCharge: true }), business(), 'intra')).toEqual([ENDORSEMENT.reverseCharge]);
    expect(endorsements(invoice(), business({ registration: 'composition' }), 'untaxed')).toEqual([
      ENDORSEMENT.composition,
    ]);
    expect(endorsements(invoice(), business({ registration: 'unregistered' }), 'untaxed')).toEqual([
      ENDORSEMENT.unregistered,
    ]);
    expect(endorsements(invoice(), business(), 'export')).toEqual([ENDORSEMENT.exportLut]);
    expect(endorsements(invoice(), business({ lutNumber: 'AD2904' }), 'export')).toEqual([
      ENDORSEMENT.exportLut,
      'LUT reference: AD2904',
    ]);
    expect(endorsements(invoice({ exportWithIgst: true }), business(), 'export')).toEqual([ENDORSEMENT.exportIgst]);
  });

  it('explains the tax in one sentence for every case', () => {
    const say = (inv = invoice(), biz = business(), cli = client()) =>
      explainTax(inv, biz, computeInvoice(inv, biz, cli));
    expect(say()).toContain('CGST and SGST');
    expect(say(invoice({ placeOfSupply: '27' }), business(), client({ stateCode: '27' }))).toContain('IGST');
    expect(say(invoice(), business(), client({ country: 'US' }))).toContain('Letter of Undertaking');
    expect(say(invoice({ exportWithIgst: true }), business(), client({ country: 'US' }))).toContain('payment of IGST');
    expect(say(invoice(), business({ registration: 'composition' }))).toContain('Composition');
    expect(say(invoice(), business({ registration: 'unregistered' }))).toContain('not registered');
  });
});
