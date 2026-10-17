import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInvoiceHtml } from './invoiceHtml.ts';
import type { BillrDocument, Business, Client, DocumentLine } from './types.ts';

const business: Business = {
  id: 1,
  name: 'Adaeze Couture',
  ownerName: 'Adaeze Okafor',
  phone: '0803 000 0000',
  email: '',
  address: '12 Allen Avenue\nIkeja',
  taxId: '',
  defaultCurrency: 'NGN',
  vatDefault: false,
  paymentBankName: 'GTBank',
  paymentAccountNumber: '0123456789',
  paymentAccountName: 'Adaeze Couture',
  defaultNotes: '',
};

const client: Client = { id: 1, name: 'Funke <Bello>', phone: '0805 221 9034', email: '', address: '', notes: '' };

const doc: BillrDocument = {
  id: 1,
  type: 'invoice',
  number: 'INV-0048',
  clientId: 1,
  currency: 'NGN',
  issueDate: '2026-10-15',
  dueDate: '2026-10-22',
  termsDays: 7,
  discountType: 'flat',
  discountFlatKobo: 0,
  discountPercent: 0,
  vatEnabled: true,
  notes: 'Balance on pickup',
  status: 'draft',
  totalKobo: 0,
  sentAt: null,
  createdAt: '',
  updatedAt: '',
};

const lines: DocumentLine[] = [
  { id: 1, documentId: 1, position: 0, description: 'Agbada set', quantity: 2, unitPriceKobo: 4_500_000 },
];

test('payment details, terms and notes always appear', () => {
  const html = renderInvoiceHtml({ doc, lines, business, client });
  assert.match(html, /GTBank/);
  assert.match(html, /0123456789/);
  assert.match(html, /Balance on pickup/);
  assert.match(html, /22 Oct 2026/);
  assert.match(html, /15 Oct 2026/);
  assert.match(html, /₦96,750\.00/); // 90,000 + 7.5% VAT
});

test('escapes client text', () => {
  const html = renderInvoiceHtml({ doc, lines, business, client });
  assert.match(html, /Funke &lt;Bello&gt;/);
  assert.doesNotMatch(html, /<Bello>/);
});

test('on-receipt terms show instead of a date', () => {
  const html = renderInvoiceHtml({ doc: { ...doc, termsDays: 0 }, lines, business, client });
  assert.match(html, /On receipt/);
});

test('a quote says valid until, never on receipt', () => {
  const html = renderInvoiceHtml({ doc: { ...doc, type: 'quote', number: 'QUO-0001', termsDays: 0 }, lines, business, client });
  assert.match(html, />Quote</);
  assert.match(html, /Valid until/);
  assert.match(html, /22 Oct 2026/);
  assert.doesNotMatch(html, /On receipt/);
});
