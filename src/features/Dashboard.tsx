import { useEffect, useMemo, useState } from 'react';
import { createInvoice } from '../app/commands';
import { hrefFor } from '../app/router';
import { useData } from '../app/store';
import { financialYear, financialYearOf, formatDate, todayIso } from '../domain/dates';
import { formatCompactRupees, formatMoney } from '../domain/money';
import {
  dueLabel,
  needsAttention,
  paymentMessage,
  summarise,
  viewInvoices,
  type InvoiceView,
  type MonthFigures,
} from '../domain/report';
import { STATUS_LABEL } from '../domain/status';
import { Badge, Icon, Stitch, toast } from '../ui/kit';
import { PaymentDialog } from './dialogs';

const COUNT_MS = 700;

/** Runs a figure up from zero once, on first paint. Stands still for people who prefer less motion. */
function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / COUNT_MS);
      setShown(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

function Figure({ label, value, note, tone = '' }: { label: string; value: number; note: string; tone?: string }) {
  const shown = useCountUp(value);
  return (
    <div className={`figure ${tone}`}>
      <dt>{label}</dt>
      <dd className="amount" aria-label={formatMoney(value)}>
        {formatMoney(shown).replace(/\.\d\d$/, '')}
      </dd>
      <dd className="figure__note">{note}</dd>
    </div>
  );
}

/** Rounds up to 1, 2 or 5 times a power of ten, so the axis ends on a tidy number. */
function niceCeiling(value: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const scaled = value / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

const CHART = { width: 720, height: 250, left: 56, right: 8, top: 14, bottom: 30, bar: 15, gap: 4 };

function Chart({ months, label }: { months: MonthFigures[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const peak = niceCeiling(Math.max(1, ...months.flatMap(month => [month.invoiced, month.received])));
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const slot = (CHART.width - CHART.left - CHART.right) / months.length;
  const y = (value: number) => CHART.top + plotHeight - (value / peak) * plotHeight;
  const focus = active === null ? null : months[active];

  return (
    <figure className="chart">
      <figcaption>
        <span>
          <i className="key key--invoiced" /> Invoiced
        </span>
        <span>
          <i className="key key--received" /> Received
        </span>
        <span className="chart__readout" aria-hidden="true">
          {focus
            ? `${focus.label}: ${formatMoney(focus.invoiced)} invoiced, ${formatMoney(focus.received)} received`
            : ''}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="group" aria-label={label}>
        {[0, 0.5, 1].map(fraction => (
          <g key={fraction}>
            <line
              className="chart__grid"
              x1={CHART.left}
              x2={CHART.width - CHART.right}
              y1={y(peak * fraction)}
              y2={y(peak * fraction)}
            />
            <text className="chart__tick" x={CHART.left - 10} y={y(peak * fraction) + 4} textAnchor="end">
              {formatCompactRupees(peak * fraction)}
            </text>
          </g>
        ))}
        {months.map((month, index) => {
          const x = CHART.left + slot * index + (slot - CHART.bar * 2 - CHART.gap) / 2;
          return (
            <g
              key={month.key}
              className={`chart__month ${active === index ? 'is-active' : ''}`}
              tabIndex={0}
              role="img"
              aria-label={`${month.label}: ${formatMoney(month.invoiced)} invoiced, ${formatMoney(month.received)} received`}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            >
              <rect
                className="chart__hit"
                x={CHART.left + slot * index}
                y={CHART.top}
                width={slot}
                height={plotHeight + CHART.bottom}
              />
              <rect
                className="chart__bar chart__bar--invoiced"
                x={x}
                y={y(month.invoiced)}
                width={CHART.bar}
                height={Math.max(0, y(0) - y(month.invoiced))}
                rx="2"
              />
              <rect
                className="chart__bar chart__bar--received"
                x={x + CHART.bar + CHART.gap}
                y={y(month.received)}
                width={CHART.bar}
                height={Math.max(0, y(0) - y(month.received))}
                rx="2"
              />
              <text
                className="chart__tick"
                x={CHART.left + slot * index + slot / 2}
                y={CHART.height - 8}
                textAnchor="middle"
              >
                {month.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function Dashboard() {
  const data = useData();
  const today = todayIso();
  const views = useMemo(() => viewInvoices(data, today), [data, today]);
  const thisYear = financialYearOf(today).startYear;
  const [startYear, setStartYear] = useState(thisYear);
  const summary = useMemo(() => summarise(views, financialYear(startYear)), [views, startYear]);
  const fy = financialYear(startYear);
  const attention = useMemo(() => needsAttention(views, today).slice(0, 5), [views, today]);
  const recent = useMemo(
    () => [...views].sort((a, b) => b.invoice.date.localeCompare(a.invoice.date)).slice(0, 6),
    [views],
  );
  const [paying, setPaying] = useState<string | null>(null);
  const payingView = views.find(view => view.invoice.id === paying) ?? null;
  const business = data.business;
  if (!business) return null;

  const remind = (view: InvoiceView) => {
    const text = paymentMessage(view, business.name, business.upiId, {
      amount: formatMoney(view.settlement.balance, view.invoice.currency),
      due: formatDate(view.invoice.dueDate),
    });
    navigator.clipboard.writeText(text).then(
      () => toast('Reminder copied. Paste it into an email or a message.'),
      () => toast('Could not reach the clipboard.'),
    );
  };

  if (views.length === 0) {
    return (
      <div className="page">
        <header className="page__head">
          <div>
            <p className="eyebrow">{business.name}</p>
            <h1>Dashboard</h1>
          </div>
        </header>
        <div className="empty empty--ruled">
          <h2>The ledger is open and the page is blank.</h2>
          <p>Raise your first invoice and the year will start to fill in here.</p>
          <button type="button" className="btn btn--primary" onClick={() => createInvoice(data)}>
            <Icon name="plus" size={16} /> New invoice
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="eyebrow">{business.name}</p>
          <h1>Dashboard</h1>
        </div>
        <div className="chips" role="group" aria-label="Financial year">
          {[thisYear - 1, thisYear].map(year => (
            <button
              key={year}
              type="button"
              className="chip"
              aria-pressed={startYear === year}
              onClick={() => setStartYear(year)}
            >
              FY {financialYear(year).label}
            </button>
          ))}
        </div>
      </header>
      <Stitch />

      <dl className="figures">
        <Figure label="Invoiced" value={summary.invoiced} note={`In FY ${fy.label}`} />
        <Figure
          label="Received"
          value={summary.received}
          note={summary.tds > 0 ? `Plus ${formatMoney(summary.tds)} deducted as TDS` : 'Cash in the bank'}
        />
        <Figure label="Outstanding" value={summary.outstanding} note="Owed to you today" />
        <Figure
          label="Overdue"
          value={summary.overdue}
          note="Past its due date"
          tone={summary.overdue > 0 ? 'figure--alert' : ''}
        />
      </dl>
      {summary.unconverted > 0 && (
        <p className="aside">
          {summary.unconverted} foreign-currency {summary.unconverted === 1 ? 'invoice is' : 'invoices are'} left out of
          these figures. Add an exchange rate to include {summary.unconverted === 1 ? 'it' : 'them'}.
        </p>
      )}

      <section className="panel">
        <h2>Month by month</h2>
        <Chart months={summary.months} label={`Invoiced and received per month in financial year ${fy.label}`} />
        <table className="visually-hidden">
          <caption>Invoiced and received per month, FY {fy.label}</caption>
          <thead>
            <tr>
              <th>Month</th>
              <th>Invoiced</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {summary.months.map(month => (
              <tr key={month.key}>
                <td>{month.label}</td>
                <td>{formatMoney(month.invoiced)}</td>
                <td>{formatMoney(month.received)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="split">
        <section className="panel">
          <h2>Needs attention</h2>
          {attention.length === 0 ? (
            <p className="quiet">Nothing is overdue and nothing falls due this week.</p>
          ) : (
            <ul className="rows">
              {attention.map(({ view, daysLeft }) => (
                <li key={view.invoice.id} className="row">
                  <a className="row__main" href={hrefFor({ name: 'invoice', id: view.invoice.id })}>
                    <strong>{view.client.name}</strong>
                    <span>
                      {view.invoice.number} · <em className={daysLeft < 0 ? 'late' : ''}>{dueLabel(daysLeft)}</em>
                    </span>
                  </a>
                  <span className="amount row__amount">
                    {formatMoney(view.settlement.balance, view.invoice.currency)}
                  </span>
                  <span className="row__actions">
                    <button type="button" className="btn" onClick={() => setPaying(view.invoice.id)}>
                      Record payment
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`Copy a reminder for ${view.invoice.number}`}
                      onClick={() => remind(view)}
                    >
                      <Icon name="copy" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Latest invoices</h2>
          <ul className="rows">
            {recent.map(view => (
              <li key={view.invoice.id} className="row">
                <a className="row__main" href={hrefFor({ name: 'invoice', id: view.invoice.id })}>
                  <strong>{view.client.name}</strong>
                  <span>
                    {view.invoice.number} · {formatDate(view.invoice.date)}
                  </span>
                </a>
                <Badge status={view.status}>{STATUS_LABEL[view.status]}</Badge>
                <span className="amount row__amount">{formatMoney(view.totals.total, view.invoice.currency)}</span>
              </li>
            ))}
          </ul>
          <a className="link" href={hrefFor({ name: 'invoices' })}>
            All invoices
          </a>
        </section>
      </div>

      <PaymentDialog open={payingView !== null} view={payingView} onClose={() => setPaying(null)} />
    </div>
  );
}
