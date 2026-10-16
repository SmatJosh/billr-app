export type Currency = 'NGN' | 'USD';

const SYMBOL: Record<Currency, string> = { NGN: '₦', USD: '$' };

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Formats kobo (or cents) without relying on Intl, which is incomplete on some Android builds.
export function formatMoney(kobo: number, currency: Currency = 'NGN', opts: { decimals?: boolean } = {}): string {
  const negative = kobo < 0;
  const abs = Math.abs(Math.round(kobo));
  const whole = groupThousands(String(Math.floor(abs / 100)));
  const fraction = String(abs % 100).padStart(2, '0');
  const showDecimals = opts.decimals ?? fraction !== '00';
  return `${negative ? '-' : ''}${SYMBOL[currency]}${whole}${showDecimals ? '.' + fraction : ''}`;
}

// Plain number for an input box: 4500000 kobo -> "45,000".
export function koboToInput(kobo: number): string {
  if (!kobo) return '';
  const whole = groupThousands(String(Math.floor(kobo / 100)));
  const fraction = kobo % 100;
  return fraction ? `${whole}.${String(fraction).padStart(2, '0')}` : whole;
}

export function formatQuantity(q: number): string {
  return Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3)));
}

export function documentNumber(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
