import type { AppData } from '../domain/types';

/** Where the workspace is kept. The app only ever talks to this interface. */
export interface Repository {
  /** Whatever was stored, unvalidated. The caller checks it. */
  load(): Promise<unknown>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'bahi';
const STORE = 'workspace';
const KEY = 'data';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        transaction.onerror = transaction.onabort = () => {
          db.close();
          reject(transaction.error ?? new Error('Browser storage refused the change.'));
        };
      }),
  );
}

/** The whole workspace is one small document in IndexedDB. Nothing leaves the device. */
export function indexedDbRepository(): Repository {
  return {
    load: () => run<unknown>('readonly', store => store.get(KEY)),
    save: data => run('readwrite', store => store.put(data, KEY)).then(() => undefined),
    clear: () => run('readwrite', store => store.delete(KEY)).then(() => undefined),
  };
}

/** Used by tests, and as a fallback when the browser offers no storage (some private windows). */
export function memoryRepository(initial: unknown = undefined): Repository {
  let stored = initial;
  return {
    load: () => Promise.resolve(stored),
    save: data => {
      stored = structuredClone(data);
      return Promise.resolve();
    },
    clear: () => {
      stored = undefined;
      return Promise.resolve();
    },
  };
}
