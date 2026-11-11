import { useSyncExternalStore } from 'react';
import { parseStored } from '../domain/backup';
import { emptyData } from '../domain/factory';
import { sampleData } from '../domain/sample';
import type { AppData, Business, Client, Invoice, Payment } from '../domain/types';
import type { Repository } from './persistence';

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

const SAVE_DELAY_MS = 350;

/**
 * The workspace in memory. Every change replaces the data with a new object (nothing is mutated),
 * tells React, and schedules a write to the repository.
 */
export class Store {
  private data: AppData = emptyData();
  private saveState: SaveState = 'idle';
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private repository: Repository;

  constructor(repository: Repository) {
    this.repository = repository;
  }

  async init(): Promise<void> {
    try {
      this.data = parseStored(await this.repository.load()) ?? emptyData();
    } catch {
      // Storage is unavailable or unreadable: start empty rather than refuse to open.
      this.data = emptyData();
      this.saveState = 'failed';
    }
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getData = (): AppData => this.data;
  getSaveState = (): SaveState => this.saveState;

  update(change: (data: AppData) => AppData): void {
    const next = change(this.data);
    if (next === this.data) return;
    this.data = next;
    this.saveState = 'saving';
    this.emit();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  /** Writes now. Called on a timer after changes, and before the page is hidden. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.saveState !== 'saving') return;
    const snapshot = this.data;
    try {
      await this.repository.save(snapshot);
      if (this.data === snapshot) this.saveState = 'saved';
    } catch {
      this.saveState = 'failed';
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

// ---- changes: each takes the data and returns new data ----

const upsert = <T extends { id: string }>(items: readonly T[], item: T): T[] =>
  items.some(existing => existing.id === item.id)
    ? items.map(existing => (existing.id === item.id ? item : existing))
    : [...items, item];

export const changes = {
  setBusiness:
    (business: Business) =>
    (data: AppData): AppData => ({ ...data, business }),
  saveClient:
    (client: Client) =>
    (data: AppData): AppData => ({ ...data, clients: upsert(data.clients, client) }),
  removeClient:
    (id: string) =>
    (data: AppData): AppData => ({
      ...data,
      clients: data.clients.filter(client => client.id !== id),
    }),
  saveInvoice:
    (invoice: Invoice) =>
    (data: AppData): AppData => ({
      ...data,
      invoices: upsert(data.invoices, invoice),
    }),
  removeInvoice:
    (id: string) =>
    (data: AppData): AppData => ({
      ...data,
      invoices: data.invoices.filter(invoice => invoice.id !== id),
    }),
  addPayment:
    (invoiceId: string, payment: Payment) =>
    (data: AppData): AppData => ({
      ...data,
      invoices: data.invoices.map(invoice =>
        invoice.id === invoiceId ? { ...invoice, sent: true, payments: [...invoice.payments, payment] } : invoice,
      ),
    }),
  removePayment:
    (invoiceId: string, paymentId: string) =>
    (data: AppData): AppData => ({
      ...data,
      invoices: data.invoices.map(invoice =>
        invoice.id === invoiceId
          ? { ...invoice, payments: invoice.payments.filter(payment => payment.id !== paymentId) }
          : invoice,
      ),
    }),
  loadSample: (today: string) => (): AppData => sampleData(today),
  replaceAll: (next: AppData) => (): AppData => next,
  startFresh: () => (): AppData => emptyData(),
};

// ---- React bindings ----

let active: Store | null = null;

export function provideStore(store: Store): void {
  active = store;
}

export function getStore(): Store {
  if (!active) throw new Error('The store has not been started.');
  return active;
}

export function useData(): AppData {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, store.getData);
}

export function useSaveState(): SaveState {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, store.getSaveState);
}

export function apply(change: (data: AppData) => AppData): void {
  getStore().update(change);
}
