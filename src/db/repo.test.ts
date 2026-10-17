import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from './schema.ts';
import { addLine, convertDocument, createClient, createDocument, ensureBusiness, getDocument, getLines, updateBusiness, updateDocument } from './repo.ts';
import { openTestDb } from '../sync/testkit.ts';

async function setup() {
  const db = openTestDb() as any;
  await migrate(db);
  const b = await ensureBusiness(db);
  await updateBusiness(db, b.id, { name: 'Kemi Lawal Events' });
  return { db, business: await ensureBusiness(db) };
}

test('a new quote gets its own numbers and stays valid for 14 days', async () => {
  const { db, business } = await setup();
  await createDocument(db, business, 'invoice');
  const q1 = await getDocument(db, await createDocument(db, business, 'quote'));
  const q2 = await getDocument(db, await createDocument(db, business, 'quote'));
  assert.equal(q1!.number, 'QUO-0001');
  assert.equal(q2!.number, 'QUO-0002');
  assert.equal(q1!.termsDays, 14);
});

test('converting a quote copies client, items, discount, VAT and notes into a new invoice', async () => {
  const { db, business } = await setup();
  await createDocument(db, business, 'invoice'); // INV-0001 already exists
  const clientId = await createClient(db, business.id, 'Grace Okon');
  const quoteId = await createDocument(db, business, 'quote');
  await updateDocument(db, quoteId, { clientId, vatEnabled: true, discountType: 'percent', discountPercent: 10, notes: '50% deposit', status: 'accepted' });
  await addLine(db, quoteId, { description: 'Asoebi outfits', quantity: 6, unitPriceKobo: 2_700_000 });
  await addLine(db, quoteId, { description: 'Alterations', quantity: 1, unitPriceKobo: 1_800_000 });
  const quote = await getDocument(db, quoteId);

  const invoiceId = await convertDocument(db, quoteId, 'invoice');
  const inv = (await getDocument(db, invoiceId))!;
  assert.equal(inv.type, 'invoice');
  assert.equal(inv.number, 'INV-0002');
  assert.equal(inv.status, 'draft');
  assert.equal(inv.clientId, clientId);
  assert.equal(inv.vatEnabled, true);
  assert.equal(inv.discountType, 'percent');
  assert.equal(inv.discountPercent, 10);
  assert.equal(inv.notes, '50% deposit');
  assert.equal(inv.termsDays, 7);
  assert.equal(inv.totalKobo, quote!.totalKobo);
  assert.ok(inv.totalKobo > 0);
  const lines = await getLines(db, invoiceId);
  assert.deepEqual(lines.map((l) => [l.description, l.quantity, l.unitPriceKobo]), [
    ['Asoebi outfits', 6, 2_700_000],
    ['Alterations', 1, 1_800_000],
  ]);
  assert.equal((await getDocument(db, quoteId))!.status, 'converted');
  assert.equal((await getLines(db, quoteId)).length, 2, 'the quote keeps its own items');
});

test('a quote can become a proforma, and the proforma an invoice', async () => {
  const { db, business } = await setup();
  const quoteId = await createDocument(db, business, 'quote');
  await addLine(db, quoteId, { description: 'Photo shoot', quantity: 1, unitPriceKobo: 15_000_000 });
  const proId = await convertDocument(db, quoteId, 'proforma');
  assert.equal((await getDocument(db, proId))!.number, 'PRO-0001');
  const invId = await convertDocument(db, proId, 'invoice');
  assert.equal((await getDocument(db, invId))!.number, 'INV-0001');
  assert.equal((await getDocument(db, proId))!.status, 'converted');
});
