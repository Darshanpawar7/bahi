import { useState, type InputHTMLAttributes } from 'react';
import { parseMoney } from '../domain/money';
import type { Paise } from '../domain/types';

type Passthrough = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

/** 5000000 paise is shown as "50000", 180050 as "1800.50": plain digits while editing, no grouping. */
function plain(paise: Paise): string {
  if (paise === 0) return '';
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`;
}

interface MoneyInputProps extends Passthrough {
  value: Paise;
  onChange: (value: Paise) => void;
}

/**
 * A money field. While focused it shows exactly what was typed; anything that is not an amount is simply
 * not accepted, so the stored value is always whole paise.
 */
export function MoneyInput({ value, onChange, ...rest }: MoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      className={`input amount ${rest.className ?? ''}`}
      inputMode="decimal"
      autoComplete="off"
      value={draft ?? plain(value)}
      onFocus={event => {
        setDraft(plain(value));
        event.target.select();
      }}
      onBlur={() => setDraft(null)}
      onChange={event => {
        const text = event.target.value;
        if (text === '') {
          setDraft('');
          onChange(0);
          return;
        }
        const parsed = parseMoney(text);
        if (parsed === null) return;
        setDraft(text);
        onChange(parsed);
      }}
    />
  );
}

interface NumberInputProps extends Passthrough {
  value: number;
  onChange: (value: number) => void;
  /** Largest value accepted. */
  max?: number;
  /** Decimal places accepted. */
  decimals?: number;
  /** Show an empty field (and its placeholder) instead of 0. */
  blankZero?: boolean;
}

/** A non-negative number with a limited number of decimals: quantities, percentages, day counts. */
export function NumberInput({
  value,
  onChange,
  max = 1e7,
  decimals = 3,
  blankZero = false,
  ...rest
}: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shape = new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`);
  return (
    <input
      {...rest}
      className={`input amount ${rest.className ?? ''}`}
      inputMode="decimal"
      autoComplete="off"
      value={draft ?? (blankZero && value === 0 ? '' : String(value))}
      onFocus={event => {
        setDraft(blankZero && value === 0 ? '' : String(value));
        event.target.select();
      }}
      onBlur={() => setDraft(null)}
      onChange={event => {
        const text = event.target.value.replace(/,/g, '');
        if (!shape.test(text)) return;
        const parsed = text === '' || text === '.' ? 0 : Number(text);
        if (parsed > max) return;
        setDraft(text);
        onChange(parsed);
      }}
    />
  );
}
