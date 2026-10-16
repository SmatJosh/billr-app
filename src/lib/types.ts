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
export type DocStatus = 'draft' | 'sent' | 'paid';

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
