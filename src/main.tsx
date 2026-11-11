import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { indexedDbRepository, memoryRepository } from './app/persistence';
import { provideStore, Store } from './app/store';
import './styles/base.css';
import './styles/app.css';

async function start(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('The page is missing its root element.');

  // Without IndexedDB (some private windows) the app still runs; it just cannot remember.
  const repository = 'indexedDB' in window ? indexedDbRepository() : memoryRepository();
  const store = new Store(repository);
  provideStore(store);
  await store.init();

  // Do not lose the last keystrokes when the tab is closed or put in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.flush();
  });

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        // Offline support is a bonus; the app works without it.
      });
  }
}

void start();
