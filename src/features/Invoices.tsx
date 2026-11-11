import { useMemo, useState } from 'react';
import { createInvoice } from '../app/commands';
import { hrefFor, navigate } from '../app/router';
import { apply, changes, useData } from '../app/store';
import { formatDate, todayIso } from '../domain/dates';
import { duplicateInvoice } from '../domain/factory';
import { formatMoney } from '../domain/money';
import { viewInvoices, type InvoiceView } from '../domain/report';
import { STATUS_LABEL } from '../domain/status';
import type { InvoiceStatus } from '../domain/types';
import { Badge, Icon, Stitch, toast } from '../ui/kit';
import { Menu, MenuItem } from '../ui/menu';
import { PaymentDialog } from './dialogs';

type Filter = 'all' | InvoiceStatus;
const FILTERS: readonly Filter[] = ['all', 'draft', 'sent', 'partially-paid', 'overdue', 'paid', 'void'];

type SortKey = 'date' | 'due' | 'amount' | 'client';
const SORTS: Record<SortKey, (a: InvoiceView, b: InvoiceView) => number> = {
  date: (a, b) => b.invoice.date.localeCompare(a.invoice.date) || b.invoice.number.localeCompare(a.invoice.number),
  due: (a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate),
  amount: (a, b) => b.totals.total * (b.toInr ?? 1) - a.totals.total * (a.toInr ?? 1),
  client: (a, b) => a.client.name.localeCompare(b.client.name),
};

export function Invoices() {
  const data = useData();
  const today = todayIso();
  const views = useMemo(() => viewInvoices(data, today), [data, today]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [paying, setPaying] = useState<string | null>(null);
  const business = data.business;

  const counts = useMemo(() => {
    const tally = new Map<Filter, number>([['all', views.length]]);
    for (const view of views) tally.set(view.status, (tally.get(view.status) ?? 0) + 1);
    return tally;
  }, [views]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return views
      .filter(view => filter === 'all' || view.status === filter)
      .filter(
        view =>
          needle === '' ||
          view.invoice.number.toLowerCase().includes(needle) ||
          view.client.name.toLowerCase().includes(needle),
      )
      .sort(SORTS[sort]);
  }, [views, filter, query, sort]);

  if (!business) return null;
  const payingView = views.find(view => view.invoice.id === paying) ?? null;

  const duplicate = (view: InvoiceView) => {
    const copy = duplicateInvoice(
      view.invoice,
      business,
      data.invoices.map(invoice => invoice.number),
      today,
    );
    apply(changes.saveInvoice(copy));
    navigate({ name: 'invoice', id: copy.id });
    toast(`Copied to a new draft, ${copy.number}.`);
  };

  const remove = (view: InvoiceView) => {
    apply(changes.removeInvoice(view.invoice.id));
    toast(`Deleted ${view.invoice.number}.`, { label: 'Undo', run: () => apply(changes.saveInvoice(view.invoice)) });
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="eyebrow">
            {views.length} {views.length === 1 ? 'invoice' : 'invoices'}
          </p>
          <h1>Invoices</h1>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => createInvoice(data)}>
          <Icon name="plus" size={16} /> New invoice
        </button>
      </header>
      <Stitch />

      {views.length === 0 ? (
        <div className="empty empty--ruled">
          <h2>No invoices yet.</h2>
          <p>Your first one takes about a minute, and the tax works itself out.</p>
          <button type="button" className="btn btn--primary" onClick={() => createInvoice(data)}>
            <Icon name="plus" size={16} /> New invoice
          </button>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="chips" role="group" aria-label="Filter by status">
              {FILTERS.filter(option => option === 'all' || (counts.get(option) ?? 0) > 0).map(option => (
                <button
                  key={option}
                  type="button"
                  className="chip"
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                >
                  {option === 'all' ? 'All' : STATUS_LABEL[option]}
                  <span>{counts.get(option) ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="toolbar__right">
              <label className="search">
                <span className="visually-hidden">Search invoices</span>
                <Icon name="search" size={16} />
                <input
                  type="search"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Number or client"
                />
              </label>
              <label className="sorter">
                <span className="visually-hidden">Sort by</span>
                <select value={sort} onChange={event => setSort(event.target.value as SortKey)}>
                  <option value="date">Newest first</option>
                  <option value="due">Due soonest</option>
                  <option value="amount">Largest first</option>
                  <option value="client">Client A to Z</option>
                </select>
              </label>
            </div>
          </div>

          <p className="visually-hidden" role="status">
            {shown.length} {shown.length === 1 ? 'invoice' : 'invoices'} shown
          </p>

          {shown.length === 0 ? (
            <p className="quiet pad">Nothing matches. Try another status or a shorter search.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Client</th>
                  <th scope="col">Date</th>
                  <th scope="col">Due</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map(view => (
                  <tr key={view.invoice.id}>
                    <th scope="row" data-label="Invoice">
                      <a href={hrefFor({ name: 'invoice', id: view.invoice.id })}>
                        {view.invoice.number || 'Untitled'}
                      </a>
                    </th>
                    <td data-label="Client">{view.client.name}</td>
                    <td data-label="Date">{formatDate(view.invoice.date)}</td>
                    <td data-label="Due">{formatDate(view.invoice.dueDate)}</td>
                    <td data-label="Status">
                      <Badge status={view.status}>{STATUS_LABEL[view.status]}</Badge>
                    </td>
                    <td data-label="Amount" className="num amount">
                      {formatMoney(view.totals.total, view.invoice.currency)}
                    </td>
                    <td className="table__actions">
                      <Menu label={`Actions for ${view.invoice.number}`}>
                        <MenuItem onSelect={() => navigate({ name: 'invoice', id: view.invoice.id })}>Open</MenuItem>
                        <MenuItem onSelect={() => duplicate(view)}>Duplicate</MenuItem>
                        {view.status === 'draft' && (
                          <MenuItem onSelect={() => apply(changes.saveInvoice({ ...view.invoice, sent: true }))}>
                            Mark as sent
                          </MenuItem>
                        )}
                        {view.status !== 'void' && (
                          <MenuItem onSelect={() => setPaying(view.invoice.id)}>Record payment</MenuItem>
                        )}
                        <MenuItem
                          onSelect={() => apply(changes.saveInvoice({ ...view.invoice, voided: !view.invoice.voided }))}
                        >
                          {view.invoice.voided ? 'Restore' : 'Mark as void'}
                        </MenuItem>
                        <MenuItem danger onSelect={() => remove(view)}>
                          Delete
                        </MenuItem>
                      </Menu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <PaymentDialog open={payingView !== null} view={payingView} onClose={() => setPaying(null)} />
    </div>
  );
}
