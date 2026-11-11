import { useMemo, type CSSProperties } from 'react';
import { encode } from 'uqr';
import type { DocumentParty, InvoiceDocument } from '../domain/document';
import './sheet.css';

/** A QR code drawn as one SVG path, so it stays razor sharp on screen and in print. */
export function Qr({ value, size }: { value: string; size: number }) {
  const { path, modules } = useMemo(() => {
    const { data, size: count } = encode(value, { ecc: 'M', border: 0 });
    const segments: string[] = [];
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) segments.push(`M${x} ${y}h1v1h-1z`);
      }),
    );
    return { path: segments.join(''), modules: count };
  }, [value]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code to pay this invoice by UPI"
    >
      <path d={path} fill="#1C1A17" />
    </svg>
  );
}

function Party({ heading, party }: { heading: string; party: DocumentParty }) {
  return (
    <div>
      <h3>{heading}</h3>
      <p className="sheet__strong">{party.name || '—'}</p>
      {party.addressLines.map(line => (
        <p key={line}>{line}</p>
      ))}
      {party.facts.length > 0 && (
        <dl className="sheet__facts">
          {party.facts.map(item => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * The invoice as an A4 page. It renders an InvoiceDocument and nothing else: every figure and label
 * was decided by the domain layer. The same component is what the browser prints to PDF.
 */
export function InvoiceSheet({ doc }: { doc: InvoiceDocument }) {
  const style = { '--accent': doc.accent } as CSSProperties;
  return (
    <article className="sheet" style={style} aria-label={`${doc.title} ${doc.number}`}>
      <header className="sheet__top">
        <div className="sheet__brand">
          {doc.logo && <img src={doc.logo} alt="" className="sheet__logo" />}
          <div>
            <p className="sheet__name">{doc.supplier.name || 'Your business'}</p>
            {doc.supplier.addressLines.map(line => (
              <p key={line} className="sheet__quiet">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="sheet__title">
          <p className="sheet__kind">{doc.title}</p>
          <p className="sheet__number">{doc.number || '—'}</p>
        </div>
      </header>

      <section className="sheet__meta">
        <Party heading="Billed to" party={doc.recipient} />
        <div>
          <h3>From</h3>
          <dl className="sheet__facts sheet__facts--open">
            {doc.supplier.facts.map(item => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3>Details</h3>
          <dl className="sheet__facts sheet__facts--open">
            <div>
              <dt>Invoice date</dt>
              <dd>{doc.date}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{doc.dueDate}</dd>
            </div>
            {doc.placeOfSupply && (
              <div>
                <dt>Place of supply</dt>
                <dd>{doc.placeOfSupply}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      <table className="sheet__items">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Description</th>
            {doc.showSac && <th>HSN/SAC</th>}
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            {doc.showDiscount && <th className="num">Discount</th>}
            {doc.showTax && <th className="num">GST</th>}
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map(line => (
            <tr key={line.no}>
              <td className="num sheet__quiet">{line.no}</td>
              <td>
                <span className="sheet__strong">{line.description || '—'}</span>
                {line.detail && <span className="sheet__detail">{line.detail}</span>}
              </td>
              {doc.showSac && <td>{line.sac}</td>}
              <td className="num">{line.quantity}</td>
              <td className="num">{line.rate}</td>
              {doc.showDiscount && <td className="num">{line.discount}</td>}
              {doc.showTax && <td className="num">{line.gstRate}</td>}
              <td className="num sheet__strong">{line.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="sheet__sum">
        <div className="sheet__left">
          <div>
            <h3>Amount in words</h3>
            <p className="sheet__words">{doc.amountInWords}</p>
          </div>
          {doc.taxSummary && (
            <table className="sheet__tax">
              <thead>
                <tr>
                  {doc.taxSummary.head.map((cell, index) => (
                    <th key={cell} className={index === 0 ? '' : 'num'}>
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doc.taxSummary.rows.map(row => (
                  <tr key={row.join('|')}>
                    {row.map((cell, index) => (
                      <td key={`${index}-${cell}`} className={index === 0 ? '' : 'num'}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(doc.upiUri || doc.bank.length > 0) && (
            <div className="sheet__pay">
              {doc.upiUri && <Qr value={doc.upiUri} size={84} />}
              <div>
                <h3>How to pay</h3>
                {doc.upiUri && (
                  <p>
                    Scan with any UPI app, or pay to <span className="sheet__strong">{doc.upiId}</span>
                  </p>
                )}
                {doc.bank.length > 0 && (
                  <dl className="sheet__facts">
                    {doc.bank.map(item => (
                      <div key={item.label}>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          )}
        </div>
        <dl className="sheet__totals">
          {doc.totals.map(row => (
            <div key={row.label} className={`sheet__row sheet__row--${row.kind}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="sheet__foot">
        <div className="sheet__notes">
          {doc.notes && (
            <div>
              <h3>Notes</h3>
              <p>{doc.notes}</p>
            </div>
          )}
          {doc.terms && (
            <div>
              <h3>Terms</h3>
              <p>{doc.terms}</p>
            </div>
          )}
          {doc.endorsements.map(line => (
            <p key={line} className="sheet__legal">
              {line}
            </p>
          ))}
        </div>
        <div className="sheet__sign">
          <p>For {doc.supplier.name || 'your business'}</p>
          <span />
          <p className="sheet__quiet">Authorised signatory</p>
        </div>
      </footer>

      {doc.stamp && (
        <div className={`sheet__stamp sheet__stamp--${doc.stamp.toLowerCase()}`} aria-hidden="true">
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <filter id="stamp-ink" x="-10%" y="-20%" width="120%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
              <feColorMatrix
                in="noise"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.7 1.32"
                result="holes"
              />
              <feComposite in="SourceGraphic" in2="holes" operator="in" />
            </filter>
          </svg>
          <span>{doc.stamp}</span>
        </div>
      )}
    </article>
  );
}
