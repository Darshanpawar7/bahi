/** All dates in Bahi are plain ISO strings (yyyy-mm-dd) with no time and no time zone. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const FY_START_MONTH = 4; // April

function parts(iso: string): { year: number; month: number; day: number } {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return { year, month, day };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Today's date where the user is, as yyyy-mm-dd. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const { year, month, day } = parts(iso);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = parts(fromIso);
  const to = parts(toIso);
  const ms = Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day);
  return Math.round(ms / 86_400_000);
}

/** "5 Nov 2026" */
export function formatDate(iso: string): string {
  if (!isIsoDate(iso)) return '';
  const { year, month, day } = parts(iso);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export interface FinancialYear {
  /** The calendar year the financial year starts in: 2026 for 2026-27. */
  startYear: number;
  /** "2026-27" */
  label: string;
  /** "26-27", as used inside invoice numbers. */
  short: string;
  start: string;
  end: string;
}

/** India's financial year runs from 1 April to 31 March. */
export function financialYear(startYear: number): FinancialYear {
  const endTwo = pad((startYear + 1) % 100);
  return {
    startYear,
    label: `${startYear}-${endTwo}`,
    short: `${pad(startYear % 100)}-${endTwo}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

export function financialYearOf(iso: string): FinancialYear {
  const { year, month } = parts(iso);
  return financialYear(month >= FY_START_MONTH ? year : year - 1);
}

export interface FyMonth {
  /** "2026-04" */
  key: string;
  /** "Apr" */
  label: string;
}

/** The twelve months of a financial year in order, April first. */
export function monthsOf(fy: FinancialYear): FyMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = ((FY_START_MONTH - 1 + index) % 12) + 1;
    const year = month >= FY_START_MONTH ? fy.startYear : fy.startYear + 1;
    return { key: `${year}-${pad(month)}`, label: MONTHS[month - 1] ?? '' };
  });
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
