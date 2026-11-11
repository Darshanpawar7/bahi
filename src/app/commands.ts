import { todayIso } from '../domain/dates';
import { draftInvoice } from '../domain/factory';
import type { AppData } from '../domain/types';
import { navigate } from './router';
import { apply, changes } from './store';

/** Starts a new draft, optionally for a known client, and opens it in the editor. */
export function createInvoice(data: AppData, clientId = ''): void {
  if (!data.business) return;
  const client = data.clients.find(candidate => candidate.id === clientId) ?? null;
  const draft = draftInvoice(
    data.business,
    client,
    data.invoices.map(invoice => invoice.number),
    todayIso(),
  );
  apply(changes.saveInvoice(draft));
  navigate({ name: 'invoice', id: draft.id });
}

/** Offers a file to the user without any server: the data never leaves the page. */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
