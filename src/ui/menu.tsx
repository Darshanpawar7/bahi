import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './kit';

/** A small "more actions" menu built on <details>, so it opens with the keyboard for free. */
export function Menu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      const details = ref.current;
      if (!details?.open) return;
      const outside = event.target instanceof Node && !details.contains(event.target);
      const escape = event instanceof KeyboardEvent && event.key === 'Escape';
      if (outside || escape) details.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  return (
    <details className="menu" ref={ref}>
      <summary className="iconbtn" aria-label={label}>
        <Icon name="more" />
      </summary>
      <div
        className="menu__list"
        role="group"
        aria-label={label}
        onClick={() => {
          if (ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function MenuItem({
  onSelect,
  danger = false,
  children,
}: {
  onSelect: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`menu__item ${danger ? 'menu__item--danger' : ''}`} onClick={onSelect}>
      {children}
    </button>
  );
}
