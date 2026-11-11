# Architecture

Bahi is a single-page app with no backend. Three layers, each depending only on the one below it:

```text
features/  (React screens)  ─┐
sheet/     (the A4 invoice)  ├─>  app/  (store, persistence, router, theme)  ─>  domain/  (pure TypeScript)
ui/        (shared parts)   ─┘
```

## Domain (`src/domain/`)

Pure functions over plain data. No React, no DOM, no storage, no clock unless a date is passed in. Everything that
has to be right lives here and is tested here.

| Module         | Responsibility                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`     | The data model: `Business`, `Client`, `Invoice`, `LineItem`, `Payment`, `AppData`. Money is `Paise` (an integer).                                                                                              |
| `money.ts`     | Exact arithmetic on integers and BigInt; half-up rounding; parsing typed amounts; Indian and international formatting.                                                                                         |
| `dates.ts`     | ISO date strings only; the April to March financial year; month lists for charts.                                                                                                                              |
| `states.ts`    | GST state codes, place-of-supply labels, and which territories charge UTGST.                                                                                                                                   |
| `gstin.ts`     | GSTIN shape, state and checksum validation; PAN shape; building valid sample GSTINs.                                                                                                                           |
| `tax.ts`       | The supply type, line and invoice totals, the CGST/SGST/UTGST/IGST split, reverse charge, tax-inclusive prices, round-off, the HSN/SAC summary, document titles, endorsements and the plain-words explanation. |
| `words.ts`     | Amount in words: lakh and crore for rupees, million and billion for other currencies.                                                                                                                          |
| `numbering.ts` | Invoice numbers per financial year; the 16-character rule.                                                                                                                                                     |
| `status.ts`    | Settlement (cash plus TDS) and the derived status: draft, sent, part paid, paid, overdue, void.                                                                                                                |
| `upi.ts`       | UPI deep links and VPA validation.                                                                                                                                                                             |
| `report.ts`    | Joins invoices with clients; financial-year summaries; what needs attention; payment messages.                                                                                                                 |
| `document.ts`  | `buildInvoiceDocument`: everything the sheet shows, already formatted.                                                                                                                                         |
| `factory.ts`   | New, empty and duplicated records.                                                                                                                                                                             |
| `sample.ts`    | A deterministic fictional workspace, dated relative to today.                                                                                                                                                  |
| `backup.ts`    | zod schemas for backups and stored data; parsing with clear, human error messages.                                                                                                                             |

### Why one view model

`buildInvoiceDocument(invoice, business, client, today)` returns an `InvoiceDocument`: the title, parties, lines, totals
rows, tax summary, amount in words, UPI link, endorsements and file name. The sheet component only renders it. Because
the live preview and the printed PDF are the same component fed the same object, a figure cannot differ between what
the user sees and what the client receives. Tests assert on the view model, which is far more stable than asserting on
markup.

## App (`src/app/`)

- **`store.ts`** keeps the whole workspace (`AppData`) in memory as an immutable value. A change is a function from old
  data to new data (see `changes`). React subscribes through `useSyncExternalStore`. Writes to storage are debounced, and
  flushed when the tab is hidden, so no keystroke is lost.
- **`persistence.ts`** is a three-method `Repository` interface (`load`, `save`, `clear`) with an IndexedDB
  implementation and an in-memory one, used when the browser offers no storage. What comes back from storage is
  validated like an imported file, and the validator is only downloaded when there is something to validate.
- **`router.ts`** uses hash routes (`#/invoices/:id`), so the app works from any sub-folder with no server rules. Ids
  from the address bar are checked against a strict pattern before use.
- **`theme.ts`** handles light, dark or match-the-device. `public/boot.js` applies the saved choice before first paint.

## Data flow for one keystroke in the editor

1. An input's `onChange` builds a new `Invoice` with the change and calls `apply(changes.saveInvoice(next))`.
2. The store swaps in new `AppData`, notifies React, and schedules a save.
3. The editor recomputes `viewInvoices` and `buildInvoiceDocument` (memoised on the data).
4. The sheet re-renders; the totals panel explains the tax in words.
5. About 350 ms later the workspace is written to IndexedDB, and "Saved on this device" appears.

## Security

- A strict Content-Security-Policy is added to production builds: `script-src 'self'` and `style-src 'self'` with no
  inline exceptions, no third-party origins, and `form-action 'none'`. Inline values (the accent colour, the preview
  scale) are set through the CSSOM, which the policy allows.
- No `innerHTML` or `dangerouslySetInnerHTML` anywhere. Everything typed or imported is rendered as text.
- Backups are size-capped, parsed as JSON, then validated field by field with zod. Unknown keys are dropped, which
  also defeats `__proto__` tricks. Logos must be PNG, JPEG or WebP data URLs under a size limit.
- File names for downloads are reduced to letters, digits and hyphens.

## Performance

- The welcome screen is server-rendered at build time (`src/prerender.tsx`, `scripts/prerender.mjs`), so a first visit
  paints before JavaScript runs.
- Each screen is a lazy chunk; zod is in the chunk that loads only when validation is needed.
- Nothing is inlined as a data URL, so the CSP holds and assets cache well.

## Extending

- **A new tax rule:** add it to `tax.ts` with tests first; if it changes what is printed, extend `InvoiceDocument` in
  `document.ts`. The sheet and the PDF pick it up together.
- **A new field on an invoice:** add it to `types.ts`, the zod schema in `backup.ts`, the factory and sample data, then
  the editor. Old backups without the field will be rejected by the schema, so give it a default in the schema if old
  files must keep loading.
- **Another storage backend:** implement `Repository` and pass it to `new Store(...)` in `main.tsx`.
