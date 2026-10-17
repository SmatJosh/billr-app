import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currenciesUsed, daysBetween, localDay, moneyIn, outstanding, paidThisMonth, quoteSummary, toCsv, type ReportDoc } from './reports.ts';

const NOW = '2026-10-17';

// Stamps are at midday UTC so the calendar day is the same in any time zone the tests run in.
function doc(p: Partial<ReportDoc>): ReportDoc {
  return {
    type: 'invoice',
    number: 'INV-0001',
    status: 'paid',
    totalKobo: 100_00,
    currency: 'NGN',
    issueDate: '2026-10-01',
    dueDate: '2026-10-08',
    sentAt: null,
    updatedAt: '2026-10-10 12:00:00',
    clientName: 'Kemi Lawal',
    ...p,
  };
}

test('reads SQLite UTC stamps as a calendar day', () => {
  assert.equal(localDay('2026-10-10 12:00:00'), '2026-10-10');
  assert.equal(daysBetween('2026-10-01', '2026-10-10'), 9);
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3);
});

test('money in this month: weekly bars, previous month, top clients, days to pay', () => {
  const docs = [
    doc({ totalKobo: 50_000_00, updatedAt: '2026-10-03 12:00:00', sentAt: '2026-10-01 12:00:00', clientName: 'Kemi Lawal' }),
    doc({ totalKobo: 30_000_00, updatedAt: '2026-10-16 12:00:00', sentAt: '2026-10-06 12:00:00', clientName: 'Funke Bello' }),
    doc({ totalKobo: 20_000_00, updatedAt: '2026-10-31 12:00:00', clientName: 'Kemi Lawal' }),
    doc({ totalKobo: 70_000_00, updatedAt: '2026-09-20 12:00:00' }), // September
    doc({ totalKobo: 99_000_00, status: 'sent', updatedAt: '2026-10-05 12:00:00' }), // not paid
    doc({ totalKobo: 99_000_00, type: 'quote', status: 'accepted', updatedAt: '2026-10-05 12:00:00' }), // not an invoice
    doc({ totalKobo: 500_00, currency: 'USD', updatedAt: '2026-10-05 12:00:00' }), // other currency
  ];
  const r = moneyIn(docs, 'NGN', 'month', NOW);
  assert.equal(r.totalKobo, 100_000_00);
  assert.equal(r.previousKobo, 70_000_00);
  assert.equal(r.previousLabel, 'September');
  assert.deepEqual(r.bars.map((b) => b.label), ['1 Oct', '8 Oct', '15 Oct', '22 Oct', '29 Oct']);
  assert.deepEqual(r.bars.map((b) => b.kobo), [50_000_00, 0, 30_000_00, 0, 20_000_00]);
  assert.deepEqual(r.bars.map((b) => b.current), [false, false, true, false, false]);
  assert.deepEqual(r.topClients, [
    { name: 'Kemi Lawal', kobo: 70_000_00 },
    { name: 'Funke Bello', kobo: 30_000_00 },
  ]);
  assert.equal(r.avgDaysToPay, 6); // 2 days and 10 days
});

test('money in this year: monthly bars against last year', () => {
  const docs = [
    doc({ totalKobo: 10_00, updatedAt: '2026-01-15 12:00:00' }),
    doc({ totalKobo: 20_00, updatedAt: '2026-10-02 12:00:00' }),
    doc({ totalKobo: 40_00, updatedAt: '2025-12-30 12:00:00' }),
  ];
  const r = moneyIn(docs, 'NGN', 'year', NOW);
  assert.equal(r.totalKobo, 30_00);
  assert.equal(r.previousKobo, 40_00);
  assert.equal(r.previousLabel, '2025');
  assert.equal(r.bars.length, 12);
  assert.equal(r.bars[0].kobo, 10_00);
  assert.equal(r.bars[9].kobo, 20_00);
  assert.equal(r.bars.findIndex((b) => b.current), 9);
  assert.equal(r.avgDaysToPay, null);
});

test('February has four weekly bars when it has 28 days', () => {
  assert.equal(moneyIn([], 'NGN', 'month', '2026-02-10').bars.length, 4);
  assert.equal(moneyIn([], 'NGN', 'month', '2026-01-10').previousLabel, 'December');
});

test('outstanding splits unpaid invoices into pending and overdue', () => {
  const docs = [
    doc({ status: 'sent', dueDate: '2026-10-20', totalKobo: 100 }),
    doc({ status: 'sent', dueDate: '2026-10-17', totalKobo: 200 }), // due today is not overdue
    doc({ status: 'sent', dueDate: '2026-10-16', totalKobo: 400 }),
    doc({ status: 'draft', dueDate: '2026-10-01', totalKobo: 800 }),
    doc({ status: 'sent', type: 'proforma', dueDate: '2026-10-01', totalKobo: 1600 }),
  ];
  assert.deepEqual(outstanding(docs, 'NGN', NOW), { pendingKobo: 300, pendingCount: 2, overdueKobo: 400, overdueCount: 1 });
  assert.equal(paidThisMonth([doc({}), doc({ updatedAt: '2026-09-30 12:00:00' })], 'NGN', NOW), 100_00);
});

test('quote summary counts sent quotes and proformas as awaiting, and quotes won this month', () => {
  const docs = [
    doc({ type: 'quote', status: 'sent', totalKobo: 1 }),
    doc({ type: 'proforma', status: 'sent', totalKobo: 2 }),
    doc({ type: 'quote', status: 'draft', totalKobo: 4 }),
    doc({ type: 'quote', status: 'accepted', totalKobo: 8, updatedAt: '2026-10-02 12:00:00' }),
    doc({ type: 'quote', status: 'converted', totalKobo: 16, updatedAt: '2026-10-03 12:00:00' }),
    doc({ type: 'proforma', status: 'converted', totalKobo: 16, updatedAt: '2026-10-04 12:00:00' }), // same job as the quote
    doc({ type: 'quote', status: 'accepted', totalKobo: 32, updatedAt: '2026-09-02 12:00:00' }), // last month
    doc({ type: 'quote', status: 'declined', totalKobo: 64 }),
  ];
  assert.deepEqual(quoteSummary(docs, 'NGN', NOW), { awaitingKobo: 3, wonKobo: 24 });
});

test('lists the business currency first', () => {
  assert.deepEqual(currenciesUsed([doc({ currency: 'USD' })], 'NGN'), ['NGN', 'USD']);
  assert.deepEqual(currenciesUsed([], 'USD'), ['USD']);
});

test('CSV export quotes awkward text and keeps amounts as plain numbers', () => {
  const csv = toCsv([
    doc({ number: 'INV-0002', issueDate: '2026-10-05', clientName: 'Bello, Funke "Mama B"', totalKobo: 4_500_050 }),
    doc({ number: 'QUO-0001', type: 'quote', status: 'sent', issueDate: '2026-10-01', clientName: null }),
  ]);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], 'Number,Type,Client,Issue date,Due or valid until,Status,Paid on,Currency,Total');
  assert.equal(lines[1], 'QUO-0001,Quote,,2026-10-01,2026-10-08,Sent,,NGN,100.00');
  assert.equal(lines[2], 'INV-0002,Invoice,"Bello, Funke ""Mama B""",2026-10-05,2026-10-08,Paid,2026-10-10,NGN,45000.50');
});
