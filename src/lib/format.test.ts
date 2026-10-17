import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentNumber, formatMoney, formatQuantity, initials, koboToInput } from './format.ts';
import { addDays, formatDay, isOverdue, isValidDay } from './dates.ts';

test('formats naira', () => {
  assert.equal(formatMoney(10_500_000), '₦105,000');
  assert.equal(formatMoney(10_500_050), '₦105,000.50');
  assert.equal(formatMoney(10_500_000, 'NGN', { decimals: true }), '₦105,000.00');
  assert.equal(formatMoney(5), '₦0.05');
  assert.equal(formatMoney(-150_000), '-₦1,500');
  assert.equal(formatMoney(12_345, 'USD'), '$123.45');
});

test('kobo to input text', () => {
  assert.equal(koboToInput(4_500_000), '45,000');
  assert.equal(koboToInput(25_050), '250.50');
  assert.equal(koboToInput(0), '');
});

test('other formatting', () => {
  assert.equal(formatQuantity(1.5), '1.5');
  assert.equal(formatQuantity(0.1 + 0.2), '0.3');
  assert.equal(documentNumber('INV', 48), 'INV-0048');
  assert.equal(initials('Funke Bello'), 'FB');
  assert.equal(initials('adaeze'), 'A');
  assert.equal(initials('  '), '?');
});

test('dates', () => {
  assert.equal(addDays('2026-10-15', 7), '2026-10-22');
  assert.equal(addDays('2026-10-15', 30), '2026-11-14');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(formatDay('2026-10-15'), '15 Oct 2026');
  assert.equal(isValidDay('2026-02-30'), false);
  assert.equal(isValidDay('2026-02-28'), true);
  assert.equal(isOverdue('2026-10-14', '2026-10-15'), true);
  assert.equal(isOverdue('2026-10-15', '2026-10-15'), false);
});

test('short amounts for tiles', async () => {
  const { formatMoneyShort } = await import('./format.ts');
  assert.equal(formatMoneyShort(0), '₦0');
  assert.equal(formatMoneyShort(95_000), '₦950');
  assert.equal(formatMoneyShort(21_250_000), '₦212.5k');
  assert.equal(formatMoneyShort(38_500_000), '₦385k');
  assert.equal(formatMoneyShort(125_000_000), '₦1.25m');
  assert.equal(formatMoneyShort(50_000, 'USD'), '$500');
});

test('short days drop this year', async () => {
  const { formatDayShort } = await import('./dates.ts');
  assert.equal(formatDayShort('2026-10-31', '2026-10-17'), '31 Oct');
  assert.equal(formatDayShort('2027-01-05', '2026-10-17'), '5 Jan 2027');
});
