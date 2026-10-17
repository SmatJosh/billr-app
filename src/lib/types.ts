import type { DiscountType } from './money.ts';
import type { Currency } from './format.ts';

export type Business = {
  id: number;
  name: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  defaultCurrency: Currency;
  vatDefault: boolean;
  paymentBankName: string;
  paymentAccountNumber: string;
  paymentAccountName: string;
  defaultNotes: string;
  // Your brand: a small logo as a data URI, and a colour from BRAND_COLORS ('' = charcoal).
  logoData: string;
  brandColor: string;
};

export type Client = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

export type Item = {
  id: number;
  name: string;
  details: string;
  defaultPriceKobo: number;
};

export type DocType = 'invoice' | 'quote' | 'proforma';
// Invoices go draft -> sent -> paid; paid is set by the app once payments cover the total. Quotes and proformas go draft -> sent, then the client's answer
// (accepted or declined), and converted once turned into the next document.
export type DocStatus = 'draft' | 'sent' | 'paid' | 'accepted' | 'declined' | 'converted';

export type PaymentMethod = 'transfer' | 'cash' | 'pos' | 'other';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: 'Transfer',
  cash: 'Cash',
  pos: 'POS',
  other: 'Other',
};

// Money received against an invoice: a deposit, a part payment or the full amount. paidOn is the day the
// money came in, which Reports use, not the day it was typed in.
export type Payment = {
  id: number;
  documentId: number;
  amountKobo: number;
  paidOn: string;
  method: PaymentMethod;
  note: string;
};

export type DocumentLine = {
  id: number;
  documentId: number;
  position: number;
  description: string;
  quantity: number;
  unitPriceKobo: number;
};

export type BillrDocument = {
  id: number;
  type: DocType;
  number: string;
  clientId: number | null;
  currency: Currency;
  issueDate: string;
  dueDate: string;
  termsDays: number | null;
  discountType: DiscountType;
  discountFlatKobo: number;
  discountPercent: number;
  vatEnabled: boolean;
  notes: string;
  status: DocStatus;
  totalKobo: number;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const DOC_LABEL: Record<DocType, string> = {
  invoice: 'Invoice',
  quote: 'Quote',
  proforma: 'Proforma invoice',
};

export const DOC_PREFIX: Record<DocType, string> = {
  invoice: 'INV',
  quote: 'QUO',
  proforma: 'PRO',
};
