import { useRef, useState, type ChangeEvent } from 'react';
import { downloadText } from '../app/commands';
import { apply, changes, useData } from '../app/store';
import { setTheme, useTheme, type ThemeChoice } from '../app/theme';
import { backupFileName, MAX_BACKUP_BYTES, parseBackup, serialiseBackup } from '../domain/backup';
import { financialYearOf, todayIso } from '../domain/dates';
import { isValidPan, normaliseGstin, validateGstin } from '../domain/gstin';
import { formatRate } from '../domain/money';
import { nextInvoiceNumber } from '../domain/numbering';
import { STATES } from '../domain/states';
import type { AppData, Business } from '../domain/types';
import { isValidVpa } from '../domain/upi';
import { NumberInput } from '../ui/inputs';
import { Dialog, Field, Icon, Stitch, toast } from '../ui/kit';
import { REGISTRATIONS } from './Welcome';

const ACCENTS: ReadonlyArray<readonly [hex: string, name: string]> = [
  ['#B4321F', 'Ledger red'],
  ['#1C1A17', 'Ink'],
  ['#2B3A8C', 'Indigo'],
  ['#1F6B4A', 'Forest'],
  ['#0F6E7A', 'Teal'],
  ['#6B2E5F', 'Plum'],
];
const THEMES: ReadonlyArray<readonly [ThemeChoice, string]> = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['system', 'Match my device'],
];
const MAX_LOGO_BYTES = 200 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ERASE_WORD = 'ERASE';
const PERCENT = 100;

function readFile(file: File, as: 'text' | 'dataUrl'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    if (as === 'text') reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

function DataSection({ data }: { data: AppData }) {
  const picker = useRef<HTMLInputElement>(null);
  const [incoming, setIncoming] = useState<AppData | null>(null);
  const [erasing, setErasing] = useState(false);
  const [typed, setTyped] = useState('');
  const today = todayIso();

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      toast('That file is too large to be a Bahi backup.');
      return;
    }
    try {
      const result = parseBackup(await readFile(file, 'text'));
      if (result.ok) setIncoming(result.data);
      else toast(result.message);
    } catch {
      toast('That file could not be read.');
    }
  };

  return (
    <section className="group" aria-labelledby="set-data">
      <h2 id="set-data">Your data</h2>
      <p className="quiet">
        Everything lives in this browser on this device. Nothing is uploaded. A backup is a plain file you can keep
        anywhere and load on another device.
      </p>
      <div className="group__buttons">
        <button
          type="button"
          className="btn"
          onClick={() => downloadText(backupFileName(today), serialiseBackup(data, new Date().toISOString()))}
        >
          <Icon name="download" size={16} /> Download a backup
        </button>
        <button type="button" className="btn" onClick={() => picker.current?.click()}>
          <Icon name="upload" size={16} /> Load a backup
        </button>
        <input
          ref={picker}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Backup file"
          onChange={pick}
        />
        <button type="button" className="btn btn--danger" onClick={() => setErasing(true)}>
          <Icon name="trash" size={16} /> Erase everything
        </button>
      </div>

      <Dialog open={incoming !== null} title="Replace what is on this device?" onClose={() => setIncoming(null)}>
        {incoming && (
          <>
            <p>
              The backup holds <strong>{incoming.invoices.length}</strong>{' '}
              {incoming.invoices.length === 1 ? 'invoice' : 'invoices'} and <strong>{incoming.clients.length}</strong>{' '}
              {incoming.clients.length === 1 ? 'client' : 'clients'}
              {incoming.business ? ` for ${incoming.business.name}` : ''}. Loading it replaces the{' '}
              {data.invoices.length} invoices and {data.clients.length} clients here now.
            </p>
            <div className="form__actions">
              <button type="button" className="btn btn--quiet" onClick={() => setIncoming(null)}>
                Keep what I have
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  apply(changes.replaceAll(incoming));
                  setIncoming(null);
                  toast('Backup loaded.');
                }}
              >
                Replace with the backup
              </button>
            </div>
          </>
        )}
      </Dialog>

      <Dialog
        open={erasing}
        title="Erase everything?"
        onClose={() => {
          setErasing(false);
          setTyped('');
        }}
      >
        <p>
          This removes your business details, every client and every invoice from this device. It cannot be undone.
          Download a backup first if you might want them back.
        </p>
        <Field label={`Type ${ERASE_WORD} to confirm`}>
          {a => (
            <input
              id={a.id}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={event => setTyped(event.target.value)}
            />
          )}
        </Field>
        <div className="form__actions">
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setErasing(false);
              setTyped('');
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={typed !== ERASE_WORD}
            onClick={() => apply(changes.startFresh())}
          >
            Erase everything
          </button>
        </div>
      </Dialog>
    </section>
  );
}

export function Settings() {
  const data = useData();
  const theme = useTheme();
  const logoPicker = useRef<HTMLInputElement>(null);
  const business = data.business;
  if (!business) return null;

  const set = (patch: Partial<Business>) => apply(changes.setBusiness({ ...business, ...patch }));
  const today = todayIso();
  const registered = business.registration !== 'unregistered';
  const gstin = business.gstin.trim() === '' ? null : validateGstin(business.gstin);
  const gstinError = registered && gstin && !gstin.ok ? gstin.message : null;
  const panError =
    business.pan.trim() !== '' && !isValidPan(business.pan) ? 'A PAN is five letters, four digits and a letter.' : null;
  const upiError =
    business.upiId.trim() !== '' && !isValidVpa(business.upiId) ? 'A UPI ID looks like name@bank.' : null;
  const nextNumber = nextInvoiceNumber(
    business.numbering,
    data.invoices.map(invoice => invoice.number),
    today,
  );

  const pickLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast('Use a PNG, JPEG or WebP image for the logo.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast('That image is over 200 KB. A smaller logo keeps your backups light.');
      return;
    }
    try {
      set({ logo: await readFile(file, 'dataUrl') });
    } catch {
      toast('That image could not be read.');
    }
  };

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <div>
          <p className="eyebrow">Saved as you type</p>
          <h1>Settings</h1>
        </div>
      </header>
      <Stitch />

      <section className="group" aria-labelledby="set-business">
        <h2 id="set-business">Your business</h2>
        <Field label="Business name">
          {a => (
            <input
              id={a.id}
              value={business.name}
              maxLength={200}
              onChange={event => set({ name: event.target.value })}
            />
          )}
        </Field>
        <Field label="Address">
          {a => (
            <textarea
              id={a.id}
              rows={3}
              value={business.address}
              maxLength={600}
              onChange={event => set({ address: event.target.value })}
            />
          )}
        </Field>
        <div className="group__cols">
          <Field label="Email">
            {a => (
              <input
                id={a.id}
                type="email"
                value={business.email}
                onChange={event => set({ email: event.target.value })}
              />
            )}
          </Field>
          <Field label="Phone">
            {a => (
              <input
                id={a.id}
                type="tel"
                value={business.phone}
                onChange={event => set({ phone: event.target.value })}
              />
            )}
          </Field>
        </div>
      </section>

      <section className="group" aria-labelledby="set-tax">
        <h2 id="set-tax">Tax</h2>
        <fieldset className="choices">
          <legend className="label">GST registration</legend>
          {REGISTRATIONS.map(([value, title, note]) => (
            <label key={value} className="choice">
              <input
                type="radio"
                name="registration"
                value={value}
                checked={business.registration === value}
                onChange={() => set({ registration: value })}
              />
              <span>
                {title}
                <small>{note}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="group__cols">
          {registered && (
            <Field label="GSTIN" error={gstinError}>
              {a => (
                <input
                  id={a.id}
                  aria-describedby={a.describedBy}
                  aria-invalid={a.invalid}
                  value={business.gstin}
                  maxLength={18}
                  spellCheck={false}
                  onChange={event => {
                    const next = normaliseGstin(event.target.value);
                    const check = validateGstin(next);
                    set(check.ok ? { gstin: next, stateCode: check.stateCode, pan: check.pan } : { gstin: next });
                  }}
                />
              )}
            </Field>
          )}
          <Field label="PAN" error={panError}>
            {a => (
              <input
                id={a.id}
                aria-describedby={a.describedBy}
                aria-invalid={a.invalid}
                value={business.pan}
                maxLength={10}
                spellCheck={false}
                onChange={event => set({ pan: event.target.value.toUpperCase() })}
              />
            )}
          </Field>
          <Field label="State">
            {a => (
              <select id={a.id} value={business.stateCode} onChange={event => set({ stateCode: event.target.value })}>
                {STATES.map(state => (
                  <option key={state.code} value={state.code}>
                    {state.name} ({state.code})
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {business.registration === 'regular' && (
          <div className="group__cols">
            <Field label="Usual GST rate" hint={`New lines start at ${formatRate(business.defaultGstRateBp)}.`}>
              {a => (
                <NumberInput
                  id={a.id}
                  aria-describedby={a.describedBy}
                  value={business.defaultGstRateBp / PERCENT}
                  max={100}
                  decimals={2}
                  onChange={percent => set({ defaultGstRateBp: Math.round(percent * PERCENT) })}
                />
              )}
            </Field>
            <Field label="Letter of Undertaking number" hint="Printed on export invoices.">
              {a => (
                <input
                  id={a.id}
                  aria-describedby={a.describedBy}
                  value={business.lutNumber}
                  maxLength={60}
                  onChange={event => set({ lutNumber: event.target.value })}
                />
              )}
            </Field>
          </div>
        )}
        <p className="aside">Bahi helps you format invoices. It is not tax advice.</p>
      </section>

      <section className="group" aria-labelledby="set-numbering">
        <h2 id="set-numbering">Invoice numbers</h2>
        <div className="group__cols">
          <Field label="Prefix">
            {a => (
              <input
                id={a.id}
                value={business.numbering.prefix}
                maxLength={6}
                spellCheck={false}
                onChange={event =>
                  set({
                    numbering: { ...business.numbering, prefix: event.target.value.replace(/[^A-Za-z0-9-]/g, '') },
                  })
                }
              />
            )}
          </Field>
          <Field label="Digits">
            {a => (
              <select
                id={a.id}
                value={business.numbering.digits}
                onChange={event => set({ numbering: { ...business.numbering, digits: Number(event.target.value) } })}
              >
                {[2, 3, 4, 5].map(count => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <p className="aside">
          Your next invoice will be <strong className="mono">{nextNumber}</strong>. The count restarts each financial
          year (now {financialYearOf(today).label}).
        </p>
      </section>

      <section className="group" aria-labelledby="set-paid">
        <h2 id="set-paid">Getting paid</h2>
        <Field label="UPI ID" hint="Printed on rupee invoices as a QR code your client can scan." error={upiError}>
          {a => (
            <input
              id={a.id}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              value={business.upiId}
              spellCheck={false}
              placeholder="name@bank"
              onChange={event => set({ upiId: event.target.value.trim() })}
            />
          )}
        </Field>
        <div className="group__cols">
          <Field label="Bank">
            {a => (
              <input id={a.id} value={business.bankName} onChange={event => set({ bankName: event.target.value })} />
            )}
          </Field>
          <Field label="Account number">
            {a => (
              <input
                id={a.id}
                value={business.bankAccount}
                inputMode="numeric"
                onChange={event => set({ bankAccount: event.target.value })}
              />
            )}
          </Field>
          <Field label="IFSC">
            {a => (
              <input
                id={a.id}
                value={business.ifsc}
                maxLength={11}
                spellCheck={false}
                onChange={event => set({ ifsc: event.target.value.toUpperCase() })}
              />
            )}
          </Field>
        </div>
        <div className="group__cols">
          <Field label="Usual payment time, in days">
            {a => (
              <NumberInput
                id={a.id}
                value={business.defaultDueDays}
                max={365}
                decimals={0}
                onChange={defaultDueDays => set({ defaultDueDays })}
              />
            )}
          </Field>
        </div>
        <Field label="Usual terms">
          {a => (
            <textarea
              id={a.id}
              rows={2}
              value={business.defaultTerms}
              maxLength={1000}
              onChange={event => set({ defaultTerms: event.target.value })}
            />
          )}
        </Field>
      </section>

      <section className="group" aria-labelledby="set-look">
        <h2 id="set-look">How your invoices look</h2>
        <fieldset className="swatches">
          <legend className="label">Accent colour</legend>
          {ACCENTS.map(([hex, name]) => (
            <label key={hex} className="swatch" style={{ color: hex }}>
              <input
                type="radio"
                name="accent"
                className="visually-hidden"
                checked={business.accent.toUpperCase() === hex}
                onChange={() => set({ accent: hex })}
              />
              <span aria-hidden="true" />
              <span className="visually-hidden">{name}</span>
            </label>
          ))}
        </fieldset>
        <div className="logo">
          {business.logo ? <img src={business.logo} alt="Your logo" /> : <span className="logo__blank">No logo</span>}
          <button type="button" className="btn" onClick={() => logoPicker.current?.click()}>
            <Icon name="upload" size={16} /> {business.logo ? 'Change logo' : 'Add a logo'}
          </button>
          {business.logo && (
            <button type="button" className="btn btn--quiet" onClick={() => set({ logo: '' })}>
              Remove
            </button>
          )}
          <input
            ref={logoPicker}
            type="file"
            accept={LOGO_TYPES.join(',')}
            className="visually-hidden"
            tabIndex={-1}
            aria-label="Logo image"
            onChange={pickLogo}
          />
        </div>
      </section>

      <section className="group" aria-labelledby="set-theme">
        <h2 id="set-theme">Appearance</h2>
        <div className="chips" role="group" aria-label="Theme">
          {THEMES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <DataSection data={data} />
    </div>
  );
}
