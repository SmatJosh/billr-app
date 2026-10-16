import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, lineTotalKobo, parseNairaToKobo, parsePercent, parseQuantity, roundKobo, type TotalsInput } from './money.ts';

const base: TotalsInput = {
  lines: [
    { quantity: 2, unitPriceKobo: 4_500_000 }, // 2 x ₦45,000
    { quantity: 1, unitPriceKobo: 1_500_000 }, // 1 x ₦15,000
  ],
  discountType: 'flat',
  discountFlatKobo: 0,
  discountPercent: 0,
  vatEnabled: false,
};

test('subtotal and total with no discount or VAT', () => {
  assert.deepEqual(computeTotals(base), { subtotalKobo: 10_500_000, discountKobo: 0, vatKobo: 0, totalKobo: 10_500_000 });
});

test('7.5% VAT on the subtotal', () => {
  const t = computeTotals({ ...base, vatEnabled: true });
  assert.equal(t.vatKobo, 787_500); // ₦7,875
  assert.equal(t.totalKobo, 11_287_500);
});

test('VAT applies after the discount', () => {
  const t = computeTotals({ ...base, discountFlatKobo: 500_000, vatEnabled: true });
  assert.equal(t.discountKobo, 500_000);
  assert.equal(t.vatKobo, 750_000); // 7.5% of ₦100,000
  assert.equal(t.totalKobo, 10_750_000);
});

test('percent discount', () => {
  const t = computeTotals({ ...base, discountType: 'percent', discountPercent: 10 });
  assert.equal(t.discountKobo, 1_050_000);
  assert.equal(t.totalKobo, 9_450_000);
});

test('switching discount type keeps both typed values', () => {
  const input = { ...base, discountFlatKobo: 200_000, discountPercent: 10 };
  const flat = computeTotals({ ...input, discountType: 'flat' });
  const pct = computeTotals({ ...input, discountType: 'percent' });
  const backToFlat = computeTotals({ ...input, discountType: 'flat' });
  assert.equal(flat.discountKobo, 200_000);
  assert.equal(pct.discountKobo, 1_050_000);
  assert.deepEqual(backToFlat, flat);
});

test('discount never exceeds the subtotal or goes negative', () => {
  assert.equal(computeTotals({ ...base, discountFlatKobo: 99_999_999 }).totalKobo, 0);
  assert.equal(computeTotals({ ...base, discountFlatKobo: -500 }).discountKobo, 0);
  assert.equal(computeTotals({ ...base, discountType: 'percent', discountPercent: 150 }).totalKobo, 0);
});

test('decimal quantities round to the nearest kobo', () => {
  assert.equal(lineTotalKobo({ quantity: 1.5, unitPriceKobo: 333 }), 500); // 499.5 rounds up
  assert.equal(lineTotalKobo({ quantity: 2.25, unitPriceKobo: 120_000 }), 270_000);
  assert.equal(lineTotalKobo({ quantity: 0.333, unitPriceKobo: 100 }), 33);
});

test('VAT rounding to kobo', () => {
  // 7.5% of ₦0.07 = 0.525 kobo -> 1 kobo
  const t = computeTotals({ ...base, lines: [{ quantity: 1, unitPriceKobo: 7 }], vatEnabled: true });
  assert.equal(t.vatKobo, 1);
  assert.equal(t.totalKobo, 8);
});

test('roundKobo handles floating point edge cases', () => {
  assert.equal(roundKobo(1.005 * 100), 101);
  assert.equal(roundKobo(0.5), 1);
  assert.equal(roundKobo(-0.5), -1);
  assert.equal(roundKobo(2.4999), 2);
});

test('no lines gives zero', () => {
  assert.deepEqual(computeTotals({ ...base, lines: [], vatEnabled: true }), { subtotalKobo: 0, discountKobo: 0, vatKobo: 0, totalKobo: 0 });
});

test('parses how people type amounts', () => {
  assert.equal(parseNairaToKobo('20k'), 2_000_000);
  assert.equal(parseNairaToKobo('1.5m'), 150_000_000);
  assert.equal(parseNairaToKobo('₦45,000'), 4_500_000);
  assert.equal(parseNairaToKobo('250.50'), 25_050);
  assert.equal(parseNairaToKobo(' 2,500 naira '), 250_000);
  assert.equal(parseNairaToKobo('.5'), 50);
  assert.equal(parseNairaToKobo(''), null);
  assert.equal(parseNairaToKobo('abc'), null);
  assert.equal(parseNairaToKobo('12..5'), null);
});

test('parses quantities and percents', () => {
  assert.equal(parseQuantity('1.5'), 1.5);
  assert.equal(parseQuantity('2'), 2);
  assert.equal(parseQuantity('x'), null);
  assert.equal(parsePercent('12.5%'), 12.5);
  assert.equal(parsePercent('120'), null);
});
