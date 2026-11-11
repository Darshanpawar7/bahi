import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from 'react';

// ---------------------------------------------------------------- icons

const PATHS = {
  plus: ['M12 5v14M5 12h14'],
  x: ['M6 6l12 12M18 6 6 18'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  back: ['M19 12H5M11 6l-6 6 6 6'],
  up: ['M12 19V5M6 11l6-6 6 6'],
  down: ['M12 5v14M6 13l6 6 6-6'],
  chevron: ['M6 9l6 6 6-6'],
  download: ['M12 4v11M7 10l5 5 5-5M5 20h14'],
  upload: ['M12 20V9M7 14l5-5 5 5M5 4h14'],
  trash: ['M4 7h16M10 11v6M14 11v6M9 7V4h6v3', 'M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12'],
  copy: ['M9 9h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z', 'M5 15V5a1 1 0 0 1 1-1h9'],
  home: ['M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z'],
  file: ['M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M14 3v5h5M9 13h6M9 17h6'],
  users: [
    'M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z',
    'M2.5 20a6.5 6.5 0 0 1 13 0',
    'M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6',
  ],
  sliders: ['M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2', 'M14 4v4M8 10v4M16 16v4'],
  sun: [
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  ],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  send: ['M4 12l16-8-6 16-3-7-7-1z'],
  search: ['M17.5 11a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z', 'M16 16l4.5 4.5'],
  alert: ['M12 8v5M12 16.5h.01', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
  paid: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M8 12.5l2.8 2.8L16 9.5'],
  print: ['M7 9V4h10v5M7 14h10v6H7z', 'M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13.5 6.5l4 4'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 2.6 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- the mark

/** The Bahi mark: a closed red ledger with a stitched spine and a label window. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="3" width="24" height="26" rx="4" fill="#B4321F" />
      <rect x="4" y="3" width="6" height="26" rx="3" fill="#8F2516" />
      <path d="M7 6.5v19" stroke="#E3A12F" strokeWidth="1.6" strokeDasharray="2.4 2.2" strokeLinecap="round" />
      <rect x="13.5" y="9" width="10.5" height="7" rx="1.2" fill="#FBF7F0" />
      <path d="M15.5 11.6h6.5M15.5 13.8h4" stroke="#B4321F" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- fields

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** A label, a control and its hint or error, wired together for screen readers. */
export function Field({ label, hint, error, className = '', children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, describedBy: note ? noteId : undefined, invalid: Boolean(error) })}
      {note && (
        <p id={noteId} className="field__note" role={error ? 'alert' : undefined}>
          {note}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- dialog

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** A modal on the native dialog element: the browser traps focus, handles Escape and restores focus. */
export function Dialog({ open, title, onClose, children, footer, wide = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog--wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClick={event => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog__body">
          <header className="dialog__head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </header>
          <div className="dialog__content">{children}</div>
          {footer && <footer className="dialog__foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------- toasts

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

const TOAST_MS = 6000;
let toasts: readonly Toast[] = [];
let nextToastId = 1;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach(listener => listener());

function dismiss(id: number): void {
  toasts = toasts.filter(toast => toast.id !== id);
  emitToasts();
}

/** Says something briefly, optionally with one action such as Undo. */
export function toast(message: string, action?: Toast['action']): void {
  const id = nextToastId++;
  toasts = [...toasts.slice(-2), { id, message, action }];
  emitToasts();
  setTimeout(() => dismiss(id), TOAST_MS);
}

const subscribeToasts = (listener: () => void) => {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
};

export function Toasts() {
  const items = useSyncExternalStore(subscribeToasts, () => toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map(item => (
        <div key={item.id} className="toast">
          <span>{item.message}</span>
          {item.action && (
            <button
              type="button"
              onClick={() => {
                item.action?.run();
                dismiss(item.id);
              }}
            >
              {item.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- small pieces

export function Badge({ status, children }: { status: string; children: ReactNode }) {
  return <span className={`badge badge--${status}`}>{children}</span>;
}

export function Stitch() {
  return <hr className="stitch" />;
}
