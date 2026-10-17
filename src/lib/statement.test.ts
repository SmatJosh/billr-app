import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatement, statementCurrencies, statementMessage, type StatementDoc } from './statement.ts';
import { renderStatementHtml } from './statementHtml.ts';

import type { Business, Client } from './types.ts';

function doc(p: Partial<StatementDoc>): StatementDoc {
  return {
    id: 1,
    type: 'invoice',
    number: 'INV-0001',
    status: 'sent',
    totalKobo: 180_000_00,
    currency: 'NGN',
    issueDate: '2026-09-01',
    dueDate: '2026-09-08',
    sentAt: null,
    updatedAt: '2026-09-20 12:00:00',
    clientName: 'Grace Okon',
    ...p,
  };
}

const docs: StatementDoc[] = [
  doc({ id: 1, payments: [{ amountKobo: 80_000_00, paidOn: '2026-09-01', method: 'transfer', note: 'Deposit' }, { amountKobo: 100_000_00, paidOn: '2026-10-02', method: 'cash', note: '' }], status: 'paid' }),
  doc({ id: 2, number: 'INV-0002', totalKobo: 50_000_00, issueDate: '2026-10-05', dueDate: '2026-10-12' }),
  doc({ id: 3, number: 'INV-0003', totalKobo: 20_000_00, issueDate: '2026-08-15', status: 'paid', updatedAt: '2026-08-20 12:00:00' }), // marked paid before payments existed
  doc({ id: 4, number: 'INV-0004', status: 'draft', totalKobo: 999_00 }),
  doc({ id: 5, number: 'QUO-0001', type: 'quote', status: 'accepted' }),
  doc({ id: 6, number: 'INV-0005', currency: 'USD', totalKobo: 300_00 }),
];

test('all time: every billed invoice and payment in order, with a running balance', () => {
  const s = buildStatement(docs, 'NGN', null);
  assert.deepEqual(
    s.entries.map((e) => [e.day, e.number, e.kind, e.label, e.balanceKobo]),
    [
      ['2026-08-15', 'INV-0003', 'invoice', 'Invoice', 20_000_00],
      ['2026-08-20', 'INV-0003', 'payment', 'Marked paid', 0],
      ['2026-09-01', 'INV-0001', 'invoice', 'Invoice', 180_000_00],
      ['2026-09-01', 'INV-0001', 'payment', 'Transfer · Deposit', 100_000_00],
      ['2026-10-02', 'INV-0001', 'payment', 'Cash', 0],
      ['2026-10-05', 'INV-0002', 'invoice', 'Invoice', 50_000_00],
    ],
  );
  assert.equal(s.openingKobo, 0);
  assert.equal(s.invoicedKobo, 250_000_00);
  assert.equal(s.paidKobo, 200_000_00);
  assert.equal(s.closingKobo, 50_000_00);
  assert.deepEqual(s.open, [{ docId: 2, number: 'INV-0002', dueDate: '2026-10-12', leftKobo: 50_000_00 }]);
});

test('a period carries the earlier balance forward', () => {
  const s = buildStatement(docs, 'NGN', '2026-10-01');
  assert.equal(s.openingKobo, 100_000_00);
  assert.deepEqual(s.entries.map((e) => e.number + ' ' + e.kind), ['INV-0001 payment', 'INV-0002 invoice']);
  assert.equal(s.invoicedKobo, 50_000_00);
  assert.equal(s.paidKobo, 100_000_00);
  assert.equal(s.closingKobo, 50_000_00);
});

test('currencies are kept apart', () => {
  assert.deepEqual(statementCurrencies(docs), ['NGN', 'USD']);
  assert.equal(buildStatement(docs, 'USD', null).closingKobo, 300_00);
});

const business = { name: 'Kemi Lawal Events', paymentBankName: 'GTBank', paymentAccountNumber: '0123456789', paymentAccountName: 'Kemi Lawal' } as Business;
const client = { name: 'Grace <Okon>', phone: '08031234567', email: '', address: '' } as Client;

test('the PDF and WhatsApp message show the balance and what is still owed', () => {
  const s = buildStatement(docs, 'NGN', '2026-10-01');
  const html = renderStatementHtml({ business, client, statement: s, now: '2026-10-17' });
  assert.match(html, /Statement/);
  assert.match(html, /1 Oct 2026 to 17 Oct 2026/);
  assert.match(html, /Balance brought forward/);
  assert.match(html, /Grace &lt;Okon&gt;/);
  assert.match(html, /Balance due<\/span><span class="mono">₦50,000\.00/);
  assert.match(html, /0123456789/);

  const msg = statementMessage(business, client, s);
  assert.match(msg, /^Hello Grace,/);
  assert.match(msg, /Balance due: ₦50,000\.00/);
  assert.match(msg, /INV-0002: ₦50,000\.00, due 12 Oct 2026/);
  assert.match(msg, /0123456789/);

  const paidUp = buildStatement(docs.slice(0, 1), 'NGN', null);
  assert.doesNotMatch(renderStatementHtml({ business, client, statement: paidUp, now: '2026-10-17' }), /0123456789/);
  assert.match(statementMessage(business, client, paidUp), /paid everything billed: ₦180,000\.00/);
});
