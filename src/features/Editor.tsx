import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hrefFor, navigate } from '../app/router';
import { apply, changes, getStore, useData, useSaveState } from '../app/store';
import { addDays, daysBetween, formatDate, todayIso } from '../domain/dates';
import { buildInvoiceDocument, type InvoiceDocument } from '../domain/document';
import { duplicateInvoice } from '../domain/factory';
import { CURRENCIES, formatMoney } from '../domain/money';
import { invoiceNumberProblem } from '../domain/numbering';
import { paymentMessage, viewInvoices, type InvoiceView } from '../domain/report';
import { STATES } from '../domain/states';
import { expectedTds, STATUS_LABEL } from '../domain/status';
import { explainTax } from '../domain/tax';
import type { Business, CurrencyCode, Invoice } from '../domain/types';
import { InvoiceSheet } from '../sheet/InvoiceSheet';
import { NumberInput } from '../ui/inputs';
import { Badge, Field, Icon, toast } from '../ui/kit';
import { Menu, MenuItem } from '../ui/menu';
import { ClientDialog, PaymentDialog } from './dialogs';
import { LinesEditor } from './LinesEditor';

const SHEET_WIDTH = 794;
const DUE_PRESETS: ReadonlyArray<readonly [days: number, label: string]> = [
  [0, 'On receipt'],
  [7, '7 days'],
  [15, '15 days'],
  [30, '30 days'],
  [45, '45 days'],
];
const DEFAULT_TDS_PERCENT = 10;

/** The live sheet, scaled down to whatever width the preview column has. */
function ScaledSheet({ doc }: { doc: InvoiceDocument }) {
  const frame = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 1123 });

  useLayoutEffect(() => {
    const outer = frame.current;
    const sheet = inner.current;
    if (!outer || !sheet) return;
    const measure = () => {
      const scale = Math.min(1, outer.clientWidth / SHEET_WIDTH);
      setBox({ scale, height: Math.round(sheet.offsetHeight * scale) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="preview" ref={frame} style={{ height: box.height }}>
      <div className="preview__inner" ref={inner} style={{ transform: `scale(${box.scale})` }}>
        <InvoiceSheet doc={doc} />
      </div>
    </div>
  );
}

/** Prints the sheet. The browser's print engine is the PDF renderer: same layout, real vector text. */
function printSheet(fileName: string): void {
  const previous = document.title;
  // Browsers suggest the page title as the PDF file name.
  document.title = fileName.replace(/\.pdf$/, '');
  const restore = () => {
    document.title = previous;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}

function SaveNote() {
  const state = useSaveState();
  const text = { idle: '', saving: 'Saving…', saved: 'Saved on this device', failed: 'Could not save' }[state];
  return (
    <span className={`savenote savenote--${state}`} role="status">
      {state === 'saved' && <Icon name="check" size={14} />}
      {text}
    </span>
  );
}

function TotalsPanel({ view, doc, business }: { view: InvoiceView; doc: InvoiceDocument; business: Business }) {
  const [tdsPercent, setTdsPercent] = useState(DEFAULT_TDS_PERCENT);
  const { invoice, totals } = view;
  const tds = expectedTds(totals.taxable, tdsPercent);
  const money = (value: number) => formatMoney(value, invoice.currency);
  return (
    <div className="totals">
      <dl>
        {doc.totals.map(row => (
          <div key={row.label} className={`totals__row totals__row--${row.kind}`}>
            <dt>{row.label}</dt>
            <dd className="amount">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="totals__why">{explainTax(invoice, business, totals)}</p>
      <p className="totals__words">{doc.amountInWords}</p>
      {invoice.currency === 'INR' && totals.taxable > 0 && (
        <div className="totals__tds">
          <label htmlFor="tds-percent">If your client deducts TDS at</label>
          <NumberInput id="tds-percent" value={tdsPercent} onChange={setTdsPercent} max={100} decimals={2} />
          <span>
            % they keep back <strong className="amount">{money(tds)}</strong> and pay you{' '}
            <strong className="amount">{money(Math.max(0, totals.total - tds))}</strong>.
          </span>
        </div>
      )}
    </div>
  );
}

export function Editor({ id }: { id: string }) {
  const data = useData();
  const today = todayIso();
  const business = data.business;
  const views = useMemo(() => viewInvoices(data, today), [data, today]);
  const view = views.find(candidate => candidate.invoice.id === id) ?? null;
  const doc = useMemo(
    () => (business && view ? buildInvoiceDocument(view.invoice, business, view.client, today) : null),
    [business, view, today],
  );
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const [clientDialog, setClientDialog] = useState<'closed' | 'new' | 'edit'>('closed');
  const [paying, setPaying] = useState(false);
  const fileName = doc?.fileName ?? '';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !fileName) return;
      const key = event.key.toLowerCase();
      if (key === 'p') {
        event.preventDefault();
        printSheet(fileName);
      } else if (key === 's') {
        event.preventDefault();
        void getStore().flush();
        toast('Saved on this device.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fileName]);

  if (!business || !view || !doc) {
    return (
      <div className="page">
        <div className="empty">
          <h1>That invoice is not here.</h1>
          <p>It may have been deleted, or the link belongs to another device.</p>
          <a className="btn btn--primary" href={hrefFor({ name: 'invoices' })}>
            Back to invoices
          </a>
        </div>
      </div>
    );
  }

  const { invoice, client, totals, status } = view;
  const hasClient = data.clients.some(candidate => candidate.id === invoice.clientId);
  const registered = business.registration !== 'unregistered';
  const domestic = client.country === 'IN';
  const taxed =
    totals.supplyType === 'intra' ||
    totals.supplyType === 'inter' ||
    (totals.supplyType === 'export' && invoice.exportWithIgst);
  const save = (patch: Partial<Invoice>) => apply(changes.saveInvoice({ ...invoice, ...patch }));
  const numberError = invoiceNumberProblem(
    invoice.number,
    registered,
    data.invoices.filter(other => other.id !== invoice.id).map(other => other.number),
  );
  const dueInDays = daysBetween(invoice.date, invoice.dueDate);
  const message = paymentMessage(view, business.name, business.upiId, {
    amount: formatMoney(view.settlement.balance || totals.total, invoice.currency),
    due: formatDate(invoice.dueDate),
  });

  const chooseClient = (clientId: string) => {
    const chosen = data.clients.find(candidate => candidate.id === clientId);
    save({
      clientId,
      placeOfSupply: chosen && chosen.country === 'IN' ? chosen.stateCode : business.stateCode,
    });
  };

  const remove = () => {
    apply(changes.removeInvoice(invoice.id));
    navigate({ name: 'invoices' });
    toast(`Deleted ${invoice.number}.`, { label: 'Undo', run: () => apply(changes.saveInvoice(invoice)) });
  };

  const duplicate = () => {
    const copy = duplicateInvoice(
      invoice,
      business,
      data.invoices.map(other => other.number),
      today,
    );
    apply(changes.saveInvoice(copy));
    navigate({ name: 'invoice', id: copy.id });
    toast(`Copied to a new draft, ${copy.number}.`);
  };

  const copyMessage = () => {
    navigator.clipboard.writeText(message).then(
      () => toast('Payment message copied.'),
      () => toast('Could not reach the clipboard.'),
    );
  };

  return (
    <div className="editor">
      <header className="editor__bar">
        <a className="btn btn--quiet editor__back" href={hrefFor({ name: 'invoices' })}>
          <Icon name="back" size={16} /> Invoices
        </a>
        <div className="editor__id">
          <h1>{invoice.number || 'Untitled invoice'}</h1>
          <Badge status={status}>{STATUS_LABEL[status]}</Badge>
          <SaveNote />
        </div>
        <div className="editor__actions">
          {status === 'draft' && (
            <button type="button" className="btn" onClick={() => save({ sent: true })}>
              <Icon name="send" size={16} /> Mark as sent
            </button>
          )}
          {status !== 'void' && (
            <button type="button" className="btn" onClick={() => setPaying(true)}>
              <Icon name="paid" size={16} /> Record payment
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => printSheet(doc.fileName)}>
            <Icon name="download" size={16} /> Download PDF
          </button>
          <Menu label="More actions for this invoice">
            <MenuItem onSelect={duplicate}>Duplicate</MenuItem>
            <MenuItem onSelect={copyMessage}>Copy payment message</MenuItem>
            <MenuItem
              onSelect={() =>
                window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
              }
            >
              Share on WhatsApp
            </MenuItem>
            {status !== 'draft' && invoice.payments.length === 0 && (
              <MenuItem onSelect={() => save({ sent: false })}>Back to draft</MenuItem>
            )}
            <MenuItem onSelect={() => save({ voided: !invoice.voided })}>
              {invoice.voided ? 'Restore' : 'Mark as void'}
            </MenuItem>
            <MenuItem danger onSelect={remove}>
              Delete
            </MenuItem>
          </Menu>
        </div>
      </header>

      <div className="editor__tabs" role="tablist" aria-label="Invoice view">
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'edit'}
          className="chip"
          onClick={() => setPane('edit')}
        >
          Edit
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'preview'}
          className="chip"
          onClick={() => setPane('preview')}
        >
          Preview
        </button>
      </div>

      <div className="editor__grid" data-pane={pane}>
        <form className="editor__form" onSubmit={event => event.preventDefault()} noValidate>
          <section className="group">
            <h2>Billed to</h2>
            <div className="group__inline">
              <Field label="Client" className="grow">
                {a => (
                  <select
                    id={a.id}
                    value={hasClient ? invoice.clientId : ''}
                    onChange={event => chooseClient(event.target.value)}
                  >
                    <option value="">Choose a client…</option>
                    {data.clients.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {hasClient && (
                <button type="button" className="btn" onClick={() => setClientDialog('edit')}>
                  <Icon name="edit" size={16} /> Edit
                </button>
              )}
              <button type="button" className="btn" onClick={() => setClientDialog('new')}>
                <Icon name="plus" size={16} /> New client
              </button>
            </div>
          </section>

          <section className="group">
            <h2>Details</h2>
            <div className="group__cols">
              <Field label="Invoice number" error={numberError}>
                {a => (
                  <input
                    id={a.id}
                    aria-describedby={a.describedBy}
                    aria-invalid={a.invalid}
                    value={invoice.number}
                    maxLength={40}
                    spellCheck={false}
                    onChange={event => save({ number: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Invoice date">
                {a => (
                  <input
                    id={a.id}
                    type="date"
                    value={invoice.date}
                    onChange={event =>
                      event.target.value &&
                      save({ date: event.target.value, dueDate: addDays(event.target.value, Math.max(0, dueInDays)) })
                    }
                  />
                )}
              </Field>
              <Field label="Due date">
                {a => (
                  <input
                    id={a.id}
                    type="date"
                    value={invoice.dueDate}
                    min={invoice.date}
                    onChange={event => event.target.value && save({ dueDate: event.target.value })}
                  />
                )}
              </Field>
            </div>
            <div className="chips" role="group" aria-label="Due date shortcuts">
              {DUE_PRESETS.map(([days, label]) => (
                <button
                  key={days}
                  type="button"
                  className="chip"
                  aria-pressed={dueInDays === days}
                  onClick={() => save({ dueDate: addDays(invoice.date, days) })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="group__cols">
              {business.registration === 'regular' && domestic && (
                <Field label="Place of supply" hint="Usually the client's state.">
                  {a => (
                    <select
                      id={a.id}
                      aria-describedby={a.describedBy}
                      value={invoice.placeOfSupply}
                      onChange={event => save({ placeOfSupply: event.target.value })}
                    >
                      {STATES.map(state => (
                        <option key={state.code} value={state.code}>
                          {state.name} ({state.code})
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
              <Field label="Currency">
                {a => (
                  <select
                    id={a.id}
                    value={invoice.currency}
                    onChange={event => save({ currency: event.target.value as CurrencyCode })}
                  >
                    {CURRENCIES.map(code => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {invoice.currency !== 'INR' && (
                <Field label={`Rupees per 1 ${invoice.currency}`} hint="Only used for your dashboard totals.">
                  {a => (
                    <NumberInput
                      id={a.id}
                      aria-describedby={a.describedBy}
                      value={invoice.exchangeRate ?? 0}
                      blankZero
                      decimals={4}
                      max={1e6}
                      placeholder="84"
                      onChange={rate => save({ exchangeRate: rate > 0 ? rate : null })}
                    />
                  )}
                </Field>
              )}
            </div>
          </section>

          <section className="group">
            <h2>Items</h2>
            <LinesEditor
              lines={invoice.lines}
              totals={totals.lines}
              business={business}
              currency={invoice.currency}
              taxed={taxed}
              onChange={lines => save({ lines })}
            />
          </section>

          <section className="group">
            <h2>Options</h2>
            <div className="group__checks">
              {taxed && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={invoice.pricesIncludeTax}
                    onChange={event => save({ pricesIncludeTax: event.target.checked })}
                  />
                  <span>
                    Rates already include GST<small>The tax is worked back out of each rate.</small>
                  </span>
                </label>
              )}
              {business.registration === 'regular' && domestic && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={invoice.reverseCharge}
                    onChange={event => save({ reverseCharge: event.target.checked })}
                  />
                  <span>
                    Reverse charge<small>The client pays the tax directly, so it is shown but not billed.</small>
                  </span>
                </label>
              )}
              {totals.supplyType === 'export' && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={invoice.exportWithIgst}
                    onChange={event => save({ exportWithIgst: event.target.checked })}
                  />
                  <span>
                    Charge IGST on this export<small>Leave off to supply under a Letter of Undertaking.</small>
                  </span>
                </label>
              )}
              {invoice.currency === 'INR' && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={invoice.roundOff}
                    onChange={event => save({ roundOff: event.target.checked })}
                  />
                  <span>
                    Round the total to the nearest rupee<small>The difference is shown as its own line.</small>
                  </span>
                </label>
              )}
            </div>
          </section>

          <section className="group">
            <h2>Total</h2>
            <TotalsPanel view={view} doc={doc} business={business} />
          </section>

          <section className="group">
            <h2>Notes and terms</h2>
            <Field label="Notes">
              {a => (
                <textarea
                  id={a.id}
                  value={invoice.notes}
                  maxLength={2000}
                  rows={2}
                  placeholder="Anything the client should know"
                  onChange={event => save({ notes: event.target.value })}
                />
              )}
            </Field>
            <Field label="Terms">
              {a => (
                <textarea
                  id={a.id}
                  value={invoice.terms}
                  maxLength={2000}
                  rows={2}
                  onChange={event => save({ terms: event.target.value })}
                />
              )}
            </Field>
          </section>
        </form>

        <aside className="editor__preview" aria-label="Invoice preview">
          <ScaledSheet doc={doc} />
        </aside>
      </div>

      {createPortal(
        <div className="print-root">
          <InvoiceSheet doc={doc} />
        </div>,
        document.body,
      )}
      <ClientDialog
        open={clientDialog !== 'closed'}
        client={clientDialog === 'edit' && hasClient ? client : null}
        onClose={() => setClientDialog('closed')}
        onSaved={saved =>
          chooseClientAfterSave(saved.id, saved.country === 'IN' ? saved.stateCode : business.stateCode)
        }
      />
      <PaymentDialog open={paying} view={view} onClose={() => setPaying(false)} />
    </div>
  );

  function chooseClientAfterSave(clientId: string, placeOfSupply: string) {
    save({ clientId, placeOfSupply });
  }
}
