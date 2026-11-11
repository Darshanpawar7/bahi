import { useSyncExternalStore } from 'react';

/** Hash routes, so the app works from any folder on a static host with no server rewrites. */
export type Route =
  | { name: 'dashboard' }
  | { name: 'invoices' }
  | { name: 'invoice'; id: string }
  | { name: 'clients' }
  | { name: 'settings' };

const SAFE_ID = /^[A-Za-z0-9-]{1,80}$/;

export function parseRoute(hash: string): Route {
  const [first = '', second = ''] = hash.replace(/^#\/?/, '').split('/');
  switch (first) {
    case 'invoices':
      // The id comes from the address bar, so it is checked before anything looks it up.
      return second && SAFE_ID.test(second) ? { name: 'invoice', id: second } : { name: 'invoices' };
    case 'clients':
      return { name: 'clients' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'dashboard' };
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return '#/';
    case 'invoice':
      return `#/invoices/${route.id}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route);
}

const subscribe = (listener: () => void): (() => void) => {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};
const getHash = (): string => window.location.hash;

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, getHash));
}
