import { useMemo, useState, type FormEvent } from 'react';
import { apply, changes } from '../app/store';
import { todayIso } from '../domain/dates';
import { buildInvoiceDocument } from '../domain/document';
import { defaultBusiness } from '../domain/factory';
import { normaliseGstin, validateGstin } from '../domain/gstin';
import { sampleData } from '../domain/sample';
import { STATES } from '../domain/states';
import type { Business, RegistrationType } from '../domain/types';
import { InvoiceSheet } from '../sheet/InvoiceSheet';
import { Dialog, Field, Mark } from '../ui/kit';

export const REGISTRATIONS: ReadonlyArray<readonly [RegistrationType, string, string]> = [
  ['regular', 'Registered under GST', 'You charge GST and issue tax invoices.'],
  ['composition', 'Composition scheme', 'You issue a bill of supply and charge no tax.'],
  ['unregistered', 'Not registered', 'You issue plain invoices with no GST.'],
];

function SetupForm({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<Business>(defaultBusiness);
  const [tried, setTried] = useState(false);
  const needsGstin = draft.registration !== 'unregistered';
  const gstin = draft.gstin.trim() === '' ? null : validateGstin(draft.gstin);
  const gstinError = needsGstin && gstin && !gstin.ok ? gstin.message : null;
  const nameError = tried && draft.name.trim() === '' ? 'What is your business called? Your own name is fine.' : null;
  const set = (patch: Partial<Business>) => setDraft(current => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (draft.name.trim() === '' || gstinError) return;
    apply(
      changes.setBusiness({ ...draft, name: draft.name.trim(), gstin: needsGstin ? normaliseGstin(draft.gstin) : '' }),
    );
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="Business name" error={nameError}>
        {a => (
          <input
            id={a.id}
            aria-describedby={a.describedBy}
            aria-invalid={a.invalid}
            value={draft.name}
            autoFocus
            onChange={event => set({ name: event.target.value })}
            placeholder="Your studio, or your own name"
          />
        )}
      </Field>
      <fieldset className="choices">
        <legend className="label">GST registration</legend>
        {REGISTRATIONS.map(([value, title, note]) => (
          <label key={value} className="choice">
            <input
              type="radio"
              name="registration"
              value={value}
              checked={draft.registration === value}
              onChange={() => set({ registration: value })}
            />
            <span>
              {title}
              <small>{note}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="form__row">
        {needsGstin && (
          <Field label="GSTIN" hint="Optional for now. Your state and PAN fill in from it." error={gstinError}>
            {a => (
              <input
                id={a.id}
                aria-describedby={a.describedBy}
                aria-invalid={a.invalid}
                value={draft.gstin}
                maxLength={18}
                spellCheck={false}
                autoCapitalize="characters"
                placeholder="29ABCDE1234F1Z5"
                onChange={event => {
                  const next = normaliseGstin(event.target.value);
                  const check = validateGstin(next);
                  set(check.ok ? { gstin: next, stateCode: check.stateCode, pan: check.pan } : { gstin: next });
                }}
              />
            )}
          </Field>
        )}
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
      </div>
      <p className="form__aside">
        Everything else, such as bank details, your logo and invoice numbering, lives in Settings.
      </p>
      <div className="form__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Back
        </button>
        <button type="submit" className="btn btn--primary">
          Start invoicing
        </button>
      </div>
    </form>
  );
}

/** First run: one click to a populated workspace, or a short form to start your own. */
export function Welcome() {
  const [settingUp, setSettingUp] = useState(false);
  const today = todayIso();
  const specimen = useMemo(() => {
    const data = sampleData(today);
    const invoice = data.invoices.find(candidate => candidate.lines.length > 1) ?? data.invoices[0];
    const client = data.clients.find(candidate => candidate.id === invoice?.clientId);
    return data.business && invoice && client ? buildInvoiceDocument(invoice, data.business, client, today) : null;
  }, [today]);

  return (
    <main className="welcome">
      <div className="welcome__copy">
        <p className="wordmark">
          <Mark size={34} /> Bahi
        </p>
        <h1>GST invoices that add themselves up.</h1>
        <p className="welcome__lede">
          Type on the left and a real invoice builds itself on the right. Save it as a PDF with a UPI code your client
          can scan. There is no account, and nothing you type ever leaves this device.
        </p>
        <div className="welcome__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => apply(changes.loadSample(today))}>
            Explore with sample data
          </button>
          <button type="button" className="btn btn--lg" onClick={() => setSettingUp(true)}>
            Set up my business
          </button>
        </div>
        <hr className="stitch" />
        <ul className="welcome__points">
          <li>
            <strong>Tax, worked out for you.</strong> CGST and SGST, IGST, or zero-rated exports, decided from two state
            codes.
          </li>
          <li>
            <strong>Yours alone.</strong> It lives in this browser, works offline, and backs up to a file you keep.
          </li>
          <li>
            <strong>Free.</strong> No plans, no invoice limit, no sign-up.
          </li>
        </ul>
      </div>
      <div className="welcome__art" aria-hidden="true">
        {specimen && (
          <div className="welcome__sheet">
            <InvoiceSheet doc={specimen} />
          </div>
        )}
      </div>
      <Dialog open={settingUp} title="Set up your business" onClose={() => setSettingUp(false)}>
        <SetupForm onClose={() => setSettingUp(false)} />
      </Dialog>
    </main>
  );
}
