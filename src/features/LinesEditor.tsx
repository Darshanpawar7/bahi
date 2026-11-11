import { useId, useRef } from 'react';
import { emptyLine } from '../domain/factory';
import { formatAmount } from '../domain/money';
import { SAC_SUGGESTIONS } from '../domain/sac';
import type { LineTotals } from '../domain/tax';
import type { Business, CurrencyCode, LineItem } from '../domain/types';
import { MoneyInput, NumberInput } from '../ui/inputs';
import { Icon } from '../ui/kit';

interface LinesEditorProps {
  lines: LineItem[];
  totals: LineTotals[];
  business: Business;
  currency: CurrencyCode;
  taxed: boolean;
  onChange: (lines: LineItem[]) => void;
}

const PERCENT = 100;
const MAX_RATE_PERCENT = 100;

/** The line items: add, edit, reorder with the arrow buttons (or the keyboard), remove. */
export function LinesEditor({ lines, totals, business, currency, taxed, onChange }: LinesEditorProps) {
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);

  const patch = (id: string, change: Partial<LineItem>) =>
    onChange(lines.map(line => (line.id === id ? { ...line, ...change } : line)));

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onChange(next);
  };

  const add = () => {
    onChange([...lines, emptyLine(business)]);
    // Put the cursor in the new line once React has drawn it.
    requestAnimationFrame(() => {
      const fields = container.current?.querySelectorAll<HTMLInputElement>('[data-line-description]');
      fields?.[fields.length - 1]?.focus();
    });
  };

  return (
    <div className="lines" ref={container}>
      <datalist id={`${listId}-sac`}>
        {SAC_SUGGESTIONS.map(item => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </datalist>
      <datalist id={`${listId}-rates`}>
        {business.quickRatesBp.map(bp => (
          <option key={bp} value={bp / PERCENT} />
        ))}
      </datalist>

      <div className="lines__head" aria-hidden="true">
        <span>Description</span>
        <span className="num">Qty</span>
        <span className="num">Rate</span>
        {taxed && <span className="num">GST %</span>}
        <span className="num">Amount</span>
        <span />
      </div>

      {lines.map((line, index) => {
        const n = index + 1;
        const computed = totals[index];
        return (
          <fieldset className="line" key={line.id}>
            <legend className="visually-hidden">Line {n}</legend>
            <div className="line__main">
              <input
                className="input"
                data-line-description
                aria-label={`Line ${n} description`}
                placeholder="What you did or sold"
                value={line.description}
                maxLength={300}
                onChange={event => patch(line.id, { description: event.target.value })}
              />
              <NumberInput
                aria-label={`Line ${n} quantity`}
                value={line.quantity}
                onChange={quantity => patch(line.id, { quantity })}
              />
              <MoneyInput
                aria-label={`Line ${n} rate`}
                placeholder="0"
                value={line.ratePaise}
                onChange={ratePaise => patch(line.id, { ratePaise })}
              />
              {taxed && (
                <NumberInput
                  aria-label={`Line ${n} GST percent`}
                  list={`${listId}-rates`}
                  max={MAX_RATE_PERCENT}
                  decimals={2}
                  value={line.gstRateBp / PERCENT}
                  onChange={percent => patch(line.id, { gstRateBp: Math.round(percent * PERCENT) })}
                />
              )}
              <output className="line__amount amount" aria-label={`Line ${n} amount`}>
                {formatAmount(computed?.total ?? 0, currency)}
              </output>
              <div className="line__tools">
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Move line ${n} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <Icon name="up" size={16} />
                </button>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Move line ${n} down`}
                  disabled={index === lines.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <Icon name="down" size={16} />
                </button>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Remove line ${n}`}
                  disabled={lines.length === 1}
                  onClick={() => onChange(lines.filter(other => other.id !== line.id))}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
            <div className="line__more">
              <input
                className="input"
                aria-label={`Line ${n} detail`}
                placeholder="A second line of detail (optional)"
                value={line.detail}
                maxLength={600}
                onChange={event => patch(line.id, { detail: event.target.value })}
              />
              {business.registration !== 'unregistered' && (
                <input
                  className="input"
                  aria-label={`Line ${n} HSN or SAC code`}
                  placeholder="SAC"
                  list={`${listId}-sac`}
                  value={line.sac}
                  inputMode="numeric"
                  maxLength={8}
                  onChange={event => patch(line.id, { sac: event.target.value.replace(/\D/g, '') })}
                />
              )}
              <input
                className="input"
                aria-label={`Line ${n} unit`}
                placeholder="Unit"
                value={line.unit}
                maxLength={20}
                onChange={event => patch(line.id, { unit: event.target.value })}
              />
              <span className="line__discount">
                <NumberInput
                  aria-label={`Line ${n} discount percent`}
                  placeholder="0"
                  blankZero
                  max={100}
                  decimals={2}
                  value={line.discount?.kind === 'percent' ? line.discount.value : 0}
                  onChange={value => patch(line.id, { discount: value > 0 ? { kind: 'percent', value } : null })}
                />
                <span aria-hidden="true">% off</span>
              </span>
            </div>
          </fieldset>
        );
      })}

      <button type="button" className="btn btn--quiet lines__add" onClick={add}>
        <Icon name="plus" size={16} /> Add a line
      </button>
    </div>
  );
}
