import { renderToString } from 'react-dom/server';
import { Welcome } from './features/Welcome';

/**
 * The welcome screen as static HTML, written into index.html at build time. A first-time visitor sees the
 * real page before any JavaScript has run; React then takes over the same markup.
 */
export function render(): string {
  return renderToString(<Welcome />);
}
