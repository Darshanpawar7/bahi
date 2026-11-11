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

/**
 * The line items. Each line is a small card: what it is, then the numbers, each with a visible label.
 * Lines move up and down with buttons, so reordering works from the keyboard as well as by pointer.
 */
export function LinesEditor({ lines, totals, business, currency, taxed, onChange }: LinesEditorProps) {
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  const showSac = business.registration !== 'unregistered';

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

      {lines.map((line, index) => {
        const n = index + 1;
        const computed = totals[index];
        return (
          <fieldset className="line" key={line.id}>
            <legend className="visually-hidden">Line {n}</legend>
            <div className="line__top">
              <span className="line__no" aria-hidden="true">
                {String(n).padStart(2, '0')}
              </span>
              <input
                className="input line__desc"
                data-line-description
                aria-label={`Description (line ${n})`}
                placeholder="What you did or sold"
                value={line.description}
                maxLength={300}
                onChange={event => patch(line.id, { description: event.target.value })}
              />
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

            <div className="line__sub">
              <input
                className="input line__detail"
                aria-label={`Detail (line ${n})`}
                placeholder="A second line of detail (optional)"
                value={line.detail}
                maxLength={600}
                onChange={event => patch(line.id, { detail: event.target.value })}
              />
              {showSac && (
                <label className="mini mini--sac">
                  <span>SAC</span>
                  <input
                    className="input"
                    aria-label={`SAC (line ${n})`}
                    list={`${listId}-sac`}
                    value={line.sac}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="998314"
                    onChange={event => patch(line.id, { sac: event.target.value.replace(/\D/g, '') })}
                  />
                </label>
              )}
            </div>

            <div className="line__nums">
              <label className="mini mini--qty">
                <span>Qty</span>
                <NumberInput
                  aria-label={`Qty (line ${n})`}
                  value={line.quantity}
                  onChange={quantity => patch(line.id, { quantity })}
                />
              </label>
              <label className="mini mini--unit">
                <span>Unit</span>
                <input
                  className="input"
                  aria-label={`Unit (line ${n})`}
                  placeholder="hours"
                  value={line.unit}
                  maxLength={20}
                  onChange={event => patch(line.id, { unit: event.target.value })}
                />
              </label>
              <label className="mini mini--rate">
                <span>Rate</span>
                <MoneyInput
                  aria-label={`Rate (line ${n})`}
                  placeholder="0"
                  value={line.ratePaise}
                  onChange={ratePaise => patch(line.id, { ratePaise })}
                />
              </label>
              {taxed && (
                <label className="mini mini--small">
                  <span>GST %</span>
                  <NumberInput
                    aria-label={`GST % (line ${n})`}
                    list={`${listId}-rates`}
                    max={MAX_RATE_PERCENT}
                    decimals={2}
                    value={line.gstRateBp / PERCENT}
                    onChange={percent => patch(line.id, { gstRateBp: Math.round(percent * PERCENT) })}
                  />
                </label>
              )}
              <label className="mini mini--small">
                <span>Disc. %</span>
                <NumberInput
                  aria-label={`Disc. % (line ${n})`}
                  placeholder="0"
                  blankZero
                  max={100}
                  decimals={2}
                  value={line.discount?.kind === 'percent' ? line.discount.value : 0}
                  onChange={value => patch(line.id, { discount: value > 0 ? { kind: 'percent', value } : null })}
                />
              </label>
              <div className="line__amount">
                <span aria-hidden="true">Amount</span>
                <output className="amount" aria-label={`Amount (line ${n})`}>
                  {formatAmount(computed?.total ?? 0, currency)}
                </output>
              </div>
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
