/**
 * Premium Staycations — Phase 1
 * Display formatting. Data stays exact; only rendering goes through here.
 */

const aed = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
  currencyDisplay: 'narrowSymbol',
});

export function formatAED(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return aed.format(amount);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return value.slice(0, 10);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  }).format(date);
}

/** Booking and task statuses render as badge-friendly labels. */
export function humanise(value: string): string {
  return value.replaceAll('_', ' ');
}
