import type { Paise } from './types';

/** name@bank: a virtual payment address. */
const VPA_SHAPE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export function isValidVpa(value: string): boolean {
  return VPA_SHAPE.test(value.trim());
}

export interface UpiRequest {
  vpa: string;
  payeeName: string;
  amountPaise: Paise;
  /** Shown to the payer in their UPI app. The invoice number goes here. */
  note: string;
}

/** A UPI deep link. Rendered as a QR code, it opens the payer's UPI app with everything filled in. */
export function upiUri({ vpa, payeeName, amountPaise, note }: UpiRequest): string {
  const amount = (Math.max(0, Math.round(amountPaise)) / 100).toFixed(2);
  // "@" is legal in a query string and some UPI apps do not decode %40, so it stays as it is.
  const address = encodeURIComponent(vpa.trim()).replace(/%40/g, '@');
  return `upi://pay?pa=${address}&pn=${encodeURIComponent(payeeName.trim())}&am=${amount}&cu=INR&tn=${encodeURIComponent(note.trim())}`;
}
