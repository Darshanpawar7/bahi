import { useState, type FormEvent } from 'react';
import { apply, changes } from '../app/store';
import { formatDate, todayIso } from '../domain/dates';
import { emptyClient, emptyPayment } from '../domain/factory';
import { normaliseGstin, validateGstin } from '../domain/gstin';
import { formatMoney } from '../domain/money';
import type { InvoiceView } from '../domain/report';
import { STATES } from '../domain/states';
import type { Client, PaymentMode } from '../domain/types';
import { MoneyInput } from '../ui/inputs';
import { Dialog, Field, Icon, toast } from '../ui/kit';

export const COUNTRIES: ReadonlyArray<readonly [code: string, name: string]> = [
  ['IN', 'India'],
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['AE', 'United Arab Emirates'],
  ['SG', 'Singapore'],
  ['AU', 'Australia'],
  ['CA', 'Canada'],
  ['DE', 'Germany'],
  ['NL', 'Netherlands'],
  ['FR', 'France'],
  ['JP', 'Japan'],
  ['ZZ', 'Another country'],
];

// ---------------------------------------------------------------- client

function ClientForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Client;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [tried, setTried] = useState(false);
  const domestic = draft.country === 'IN';
  const gstin = draft.gstin.trim() === '' ? null : validateGstin(draft.gstin);
  const gstinError = gstin && !gstin.ok ? gstin.message : null;
  const nameError = tried && draft.name.trim() === '' ? 'Give the client a name.' : null;

  const set = (patch: Partial<Client>) => setDraft(current => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (draft.name.trim() === '' || gstinError) return;
    const saved: Client = {
      ...draft,
      name: draft.name.trim(),
      gstin: domestic ? normaliseGstin(draft.gstin) : '',
      stateCode: domestic ? draft.stateCode : '',
    };
    apply(changes.saveClient(saved));
    onSaved?.(saved);
    onClose();
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="Client name" error={nameError}>
        {a => (
          <input
            id={a.id}
            aria-describedby={a.describedBy}
            aria-invalid={a.invalid}
            value={draft.name}
            autoFocus
            onChange={event => set({ name: event.target.value })}
            placeholder="Company or person"
          />
        )}
      </Field>
      <div className="form__row">
        <Field label="Country">
          {a => (
            <select id={a.id} value={draft.country} onChange={event => set({ country: event.target.value })}>
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {domestic && (
          <Field label="State">
            {a => (
              <select id={a.id} value={draft.stateCode} onChange={event => set({ stateCode: event.target.value })}>
                {STATES.map(state => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
      </div>
      {domestic && (
        <Field
          label="GSTIN"
          hint="Leave empty if the client is not registered. The state fills in from it."
          error={gstinError}
        >
          {a => (
            <input
              id={a.id}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              value={draft.gstin}
              maxLength={18}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="29ABCDE1234F1Z5"
              onChange={event => {
                const next = normaliseGstin(event.target.value);
                const check = validateGstin(next);
                set(check.ok ? { gstin: next, stateCode: check.stateCode } : { gstin: next });
              }}
            />
          )}
        </Field>
      )}
      <Field label="Address">
        {a => (
          <textarea id={a.id} value={draft.address} rows={3} onChange={event => set({ address: event.target.value })} />
        )}
      </Field>
      <Field label="Email">
        {a => (
          <input id={a.id} type="email" value={draft.email} onChange={event => set({ email: event.target.value })} />
        )}
      </Field>
      <div className="form__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Save client
        </button>
      </div>
    </form>
  );
}

interface ClientDialogProps {
  open: boolean;
  /** The client to edit, or null to add one. */
  client: Client | null;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}

export function ClientDialog({ open, client, onClose, onSaved }: ClientDialogProps) {
  return (
    <Dialog open={open} title={client ? 'Edit client' : 'New client'} onClose={onClose}>
      <ClientForm key={client?.id ?? 'new'} initial={client ?? emptyClient()} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

// ---------------------------------------------------------------- payment

const MODES: ReadonlyArray<readonly [PaymentMode, string]> = [
  ['upi', 'UPI'],
  ['bank', 'Bank transfer'],
  ['cheque', 'Cheque'],
  ['cash', 'Cash'],
  ['other', 'Other'],
];

function PaymentForm({ view, onClose }: { view: InvoiceView; onClose: () => void }) {
  const { invoice, settlement } = view;
  const [draft, setDraft] = useState(() => emptyPayment(todayIso(), settlement.balance));
  const money = (value: number) => formatMoney(value, invoice.currency);
  const nothing = draft.amountPaise + draft.tdsPaise === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (nothing) return;
    apply(changes.addPayment(invoice.id, draft));
    toast(`Payment recorded on ${invoice.number}.`);
    onClose();
  };

  return (
    <>
      {invoice.payments.length > 0 && (
        <ul className="paylist">
          {invoice.payments.map(payment => (
            <li key={payment.id}>
              <span>{formatDate(payment.date)}</span>
              <span className="amount">
                {money(payment.amountPaise)}
                {payment.tdsPaise > 0 && <small> + {money(payment.tdsPaise)} TDS</small>}
              </span>
              <button
                type="button"
                className="iconbtn"
                aria-label={`Remove the payment of ${money(payment.amountPaise)}`}
                onClick={() => apply(changes.removePayment(invoice.id, payment.id))}
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="dialog__lede">
        Balance due <strong className="amount">{money(settlement.balance)}</strong>
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <div className="form__row">
          <Field label="Amount received">
            {a => (
              <MoneyInput
                id={a.id}
                value={draft.amountPaise}
                onChange={amountPaise => setDraft({ ...draft, amountPaise })}
                autoFocus
              />
            )}
          </Field>
          <Field label="Date">
            {a => (
              <input
                id={a.id}
                type="date"
                value={draft.date}
                max={todayIso()}
                onChange={event => setDraft({ ...draft, date: event.target.value || draft.date })}
              />
            )}
          </Field>
        </div>
        <Field
          label="TDS your client deducted"
          hint="Tax they kept back and paid to the government for you. It settles the invoice like cash does."
        >
          {a => (
            <MoneyInput
              id={a.id}
              aria-describedby={a.describedBy}
              value={draft.tdsPaise}
              onChange={tdsPaise => setDraft({ ...draft, tdsPaise })}
              placeholder="0"
            />
          )}
        </Field>
        <div className="form__row">
          <Field label="Paid by">
            {a => (
              <select
                id={a.id}
                value={draft.mode}
                onChange={event => setDraft({ ...draft, mode: event.target.value as PaymentMode })}
              >
                {MODES.map(([mode, label]) => (
                  <option key={mode} value={mode}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Reference">
            {a => (
              <input
                id={a.id}
                value={draft.reference}
                maxLength={120}
                onChange={event => setDraft({ ...draft, reference: event.target.value })}
                placeholder="Optional"
              />
            )}
          </Field>
        </div>
        <div className="form__actions">
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
          <button type="submit" className="btn btn--primary" disabled={nothing}>
            Record payment
          </button>
        </div>
      </form>
    </>
  );
}

export function PaymentDialog({
  open,
  view,
  onClose,
}: {
  open: boolean;
  view: InvoiceView | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open && view !== null}
      title={view ? `Payments on ${view.invoice.number}` : 'Payments'}
      onClose={onClose}
    >
      {view && <PaymentForm key={`${view.invoice.id}-${view.invoice.payments.length}`} view={view} onClose={onClose} />}
    </Dialog>
  );
}
