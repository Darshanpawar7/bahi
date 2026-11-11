import { lazy, Suspense, useEffect } from 'react';
import { Welcome } from '../features/Welcome';
import { Icon, Mark, Toasts, type IconName } from '../ui/kit';
import { createInvoice } from './commands';
import { hrefFor, useRoute, type Route } from './router';
import { apply, changes, useData } from './store';
import { resolveTheme, setTheme, useTheme } from './theme';

const NAV: ReadonlyArray<{ route: Route; label: string; icon: IconName }> = [
  { route: { name: 'dashboard' }, label: 'Dashboard', icon: 'home' },
  { route: { name: 'invoices' }, label: 'Invoices', icon: 'file' },
  { route: { name: 'clients' }, label: 'Clients', icon: 'users' },
  { route: { name: 'settings' }, label: 'Settings', icon: 'sliders' },
];

const TITLES: Record<Route['name'], string> = {
  dashboard: 'Dashboard',
  invoices: 'Invoices',
  invoice: 'Invoice',
  clients: 'Clients',
  settings: 'Settings',
};

// Each screen is its own chunk: a first visit downloads only the welcome screen.
const Dashboard = lazy(() => import('../features/Dashboard').then(module => ({ default: module.Dashboard })));
const Invoices = lazy(() => import('../features/Invoices').then(module => ({ default: module.Invoices })));
const Editor = lazy(() => import('../features/Editor').then(module => ({ default: module.Editor })));
const Clients = lazy(() => import('../features/Clients').then(module => ({ default: module.Clients })));
const Settings = lazy(() => import('../features/Settings').then(module => ({ default: module.Settings })));

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'invoices':
      return <Invoices />;
    case 'invoice':
      return <Editor key={route.id} id={route.id} />;
    case 'clients':
      return <Clients />;
    case 'settings':
      return <Settings />;
    default:
      return <Dashboard />;
  }
}

export function App() {
  const data = useData();
  const route = useRoute();
  const theme = useTheme();
  const dark = resolveTheme(theme) === 'dark';

  const hasWorkspace = data.business !== null;
  useEffect(() => {
    try {
      localStorage.setItem('bahi-returning', hasWorkspace ? '1' : '0');
    } catch {
      // Without storage the welcome screen may flash briefly for returning visitors; nothing breaks.
    }
    document.documentElement.classList.toggle('returning', hasWorkspace);
  }, [hasWorkspace]);

  useEffect(() => {
    document.title = data.business ? `${TITLES[route.name]} · Bahi` : 'Bahi · GST-ready invoices, on your device';
    // A new screen starts at its top, and screen-reader focus moves to the page.
    window.scrollTo(0, 0);
  }, [route.name, data.business]);

  if (!data.business) {
    return (
      <>
        <Welcome />
        <Toasts />
      </>
    );
  }

  // The invoice screens belong to "Invoices" in the navigation.
  const current = route.name === 'invoice' ? 'invoices' : route.name;

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="side">
        <a className="wordmark" href={hrefFor({ name: 'dashboard' })}>
          <Mark /> Bahi
        </a>
        <button type="button" className="btn btn--primary side__new" onClick={() => createInvoice(data)}>
          <Icon name="plus" size={16} /> New invoice
        </button>
        <nav aria-label="Main">
          <ul>
            {NAV.map(item => (
              <li key={item.label}>
                <a href={hrefFor(item.route)} aria-current={current === item.route.name ? 'page' : undefined}>
                  <Icon name={item.icon} /> {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="side__foot">
          <button
            type="button"
            className="iconbtn"
            aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
            onClick={() => setTheme(dark ? 'light' : 'dark')}
          >
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
          <span>On this device only</span>
        </div>
      </aside>

      <main className="main" id="main" tabIndex={-1}>
        {data.sample && (
          <div className="banner" role="note">
            <span>
              <strong>You are looking at sample data.</strong> Change anything you like. It is all fictional.
            </span>
            <button type="button" className="btn" onClick={() => apply(changes.startFresh())}>
              Start fresh
            </button>
          </div>
        )}
        <Suspense fallback={<div className="page" aria-busy="true" />}>
          <Screen route={route} />
        </Suspense>
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.map(item => (
          <a
            key={item.label}
            href={hrefFor(item.route)}
            aria-current={current === item.route.name ? 'page' : undefined}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
