// Charcoal and Saffron, the theme chosen for Billr (design canvas, version 25).
export const color = {
  ink: '#1C1915',
  ink2: '#36302A',
  onInk: '#FFFFFF',
  paper: '#F8F4EA',
  surface: '#FFFFFF',
  line: '#EAE3D3',
  line2: '#F1ECE0',
  edge: '#DCD3BF',
  tx: '#1C1915',
  tx2: '#4C463D',
  tx3: '#6A6356',
  muted: '#F0EADC',
  hover: '#FCFAF4',
  accent: '#985700',
  accentSoft: '#F9D77E',
  accentOnSoft: '#1C1915',
  paidBg: '#E3F3EA',
  paidTx: '#17633D',
  dueBg: '#FCE9E7',
  dueTx: '#A12A1C',
  partBg: '#FFE6D2',
  partTx: '#8F3B00',
} as const;

export const font = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

// 4 px grid, 16 px screen gutter, 48 px minimum touch target.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { pill: 999, card: 16, input: 12, sheet: 28 } as const;
export const TOUCH = 48;
