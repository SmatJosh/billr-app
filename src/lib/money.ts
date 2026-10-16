// All money is integer kobo (1 naira = 100 kobo). Never store or add floats.

export const VAT_RATE_PERCENT = 7.5;

export type DiscountType = 'flat' | 'percent';

export type Line = {
  quantity: number; // may be decimal, e.g. 1.5 yards
  unitPriceKobo: number;
};

export type TotalsInput = {
  lines: Line[];
  discountType: DiscountType;
  // Both values are kept so switching type never loses what the user typed.
  discountFlatKobo: number;
  discountPercent: number;
  vatEnabled: boolean;
  vatRatePercent?: number;
};

export type Totals = {
  subtotalKobo: number;
  discountKobo: number;
  vatKobo: number;
  totalKobo: number;
};

// Round half away from zero, so 0.5 kobo goes up like a cashier would.
export function roundKobo(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) + Number.EPSILON * Math.abs(value));
}

export function lineTotalKobo(line: Line): number {
  if (!Number.isFinite(line.quantity) || !Number.isFinite(line.unitPriceKobo)) return 0;
  return roundKobo(line.quantity * line.unitPriceKobo);
}

export function computeTotals(input: TotalsInput): Totals {
  const subtotalKobo = input.lines.reduce((sum, l) => sum + lineTotalKobo(l), 0);

  let discountKobo =
    input.discountType === 'flat'
      ? Math.round(input.discountFlatKobo || 0)
      : roundKobo((subtotalKobo * (input.discountPercent || 0)) / 100);
  discountKobo = Math.min(Math.max(discountKobo, 0), subtotalKobo);

  const taxable = subtotalKobo - discountKobo;
  const rate = input.vatRatePercent ?? VAT_RATE_PERCENT;
  const vatKobo = input.vatEnabled ? roundKobo((taxable * rate) / 100) : 0;

  return { subtotalKobo, discountKobo, vatKobo, totalKobo: taxable + vatKobo };
}

// Parses what people actually type: "20k", "1.5m", "₦45,000", "250.50".
// Returns kobo, or null when the text is not a number.
export function parseNairaToKobo(text: string): number | null {
  const cleaned = text.trim().toLowerCase().replace(/[₦,\s]|ngn|naira/g, '');
  if (cleaned === '') return null;
  const match = cleaned.match(/^(\d+(?:\.\d+)?|\.\d+)(k|m)?$/);
  if (!match) return null;
  const multiplier = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
  return roundKobo(Number(match[1]) * multiplier * 100);
}

export function parseQuantity(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '');
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function parsePercent(text: string): number | null {
  const n = parseQuantity(text.replace('%', ''));
  if (n === null || n > 100) return null;
  return n;
}
