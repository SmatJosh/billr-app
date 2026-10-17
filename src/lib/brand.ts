// The colours a business can pick for its invoices, receipts and statements. All dark enough for white
// paper and for white text on them. '' is the default, Billr's own charcoal.
export const BRAND_COLORS = [
  { value: '', name: 'Charcoal', hex: '#1C1915' },
  { value: '#985700', name: 'Saffron', hex: '#985700' },
  { value: '#17633D', name: 'Green', hex: '#17633D' },
  { value: '#0E6672', name: 'Teal', hex: '#0E6672' },
  { value: '#1F3A68', name: 'Navy', hex: '#1F3A68' },
  { value: '#5B2F7A', name: 'Purple', hex: '#5B2F7A' },
  { value: '#8E2450', name: 'Wine', hex: '#8E2450' },
  { value: '#A12A1C', name: 'Red', hex: '#A12A1C' },
] as const;

// Only colours from the list are used, so a bad value from an old backup can never break the PDF.
export function brandHex(brandColor: string): string {
  return BRAND_COLORS.find((c) => c.value === brandColor)?.hex ?? BRAND_COLORS[0].hex;
}

// A logo is kept as a data URI (data:image/png;base64,...). Anything else is ignored.
export function isLogo(logoData: string): boolean {
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logoData);
}
