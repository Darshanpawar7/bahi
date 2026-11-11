import { useMemo, useState } from 'react';
import { createInvoice } from '../app/commands';
import { apply, changes, useData } from '../app/store';
import { todayIso } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { clientFigures, viewInvoices } from '../domain/report';
import { stateName } from '../domain/states';
import type { Client } from '../domain/types';
import { Icon, Stitch, toast } from '../ui/kit';
import { Menu, MenuItem } from '../ui/menu';
import { ClientDialog, COUNTRIES } from './dialogs';

const countryName = (code: string) => COUNTRIES.find(([value]) => value === code)?.[1] ?? code;

export function Clients() {
  const data = useData();
  const today = todayIso();
  const figures = useMemo(() => clientFigures(viewInvoices(data, today)), [data, today]);
  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  const clients = useMemo(() => [...data.clients].sort((a, b) => a.name.localeCompare(b.name)), [data.clients]);

  const remove = (client: Client) => {
    if ((figures.get(client.id)?.invoices ?? 0) > 0) {
      toast(`${client.name} has invoices. Delete those first, or keep the client.`);
      return;
    }
    apply(changes.removeClient(client.id));
    toast(`Removed ${client.name}.`, { label: 'Undo', run: () => apply(changes.saveClient(client)) });
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="eyebrow">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}
          </p>
          <h1>Clients</h1>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> New client
        </button>
      </header>
      <Stitch />

      {clients.length === 0 ? (
        <div className="empty empty--ruled">
          <h2>Nobody here yet.</h2>
          <p>Add the people and companies you bill. A GSTIN fills in their state for you.</p>
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> New client
          </button>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Client</th>
              <th scope="col">Where</th>
              <th scope="col">GSTIN</th>
              <th scope="col" className="num">
                Billed
              </th>
              <th scope="col" className="num">
                Outstanding
              </th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.map(client => {
              const figure = figures.get(client.id);
              return (
                <tr key={client.id}>
                  <th scope="row" data-label="Client">
                    <button type="button" className="table__link" onClick={() => setEditing(client)}>
                      {client.name}
                    </button>
                  </th>
                  <td data-label="Where">
                    {client.country === 'IN' ? stateName(client.stateCode) : countryName(client.country)}
                  </td>
                  <td data-label="GSTIN" className="mono">
                    {client.gstin || <span className="quiet">Not registered</span>}
                  </td>
                  <td data-label="Billed" className="num amount">
                    {formatMoney(figure?.billed ?? 0)}
                  </td>
                  <td data-label="Outstanding" className="num amount">
                    {formatMoney(figure?.outstanding ?? 0)}
                  </td>
                  <td className="table__actions">
                    <Menu label={`Actions for ${client.name}`}>
                      <MenuItem onSelect={() => createInvoice(data, client.id)}>New invoice</MenuItem>
                      <MenuItem onSelect={() => setEditing(client)}>Edit</MenuItem>
                      <MenuItem danger onSelect={() => remove(client)}>
                        Remove
                      </MenuItem>
                    </Menu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <ClientDialog
        open={editing !== null}
        client={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
