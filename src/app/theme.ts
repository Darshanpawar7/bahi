import { useEffect, useSyncExternalStore } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'bahi-theme';
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

let choice: ThemeChoice = read();

export function setTheme(next: ThemeChoice): void {
  choice = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Private windows may refuse storage; the choice still applies for this visit.
  }
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(value: ThemeChoice): 'light' | 'dark' {
  if (value !== 'system') return value;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Keeps <html data-theme> in step with the choice, and with the system when the choice is "system". */
export function useTheme(): ThemeChoice {
  const current = useSyncExternalStore(subscribe, () => choice);
  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme = resolveTheme(current);
    };
    applyTheme();
    const media = window.matchMedia(DARK_QUERY);
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [current]);
  return current;
}
