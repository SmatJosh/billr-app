import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATIONS, migrate } from '../db/schema.ts';
import {
  addLine,
  addPayment,
  createClient,
  createDocument,
  deleteClient,
  deleteDocument,
  ensureBusiness,
  getLines,
  listClients,
  listDocuments,
  listPayments,
  updateBusiness,
  updateClient,
  updateDocument,
} from '../db/repo.ts';
import { countPending, OtherAccountError, sync } from './engine.ts';
import { FakeRemote, openTestDb, type TestDb } from './testkit.ts';

const USER = 'user-a';

async function phone(): Promise<TestDb> {
  const db = openTestDb();
  await migrate(db as any);
  return db;
}

// A phone with a business, a client and one invoice with two lines.
async function phoneWithInvoice() {
  const db = await phone();
  const b = await ensureBusiness(db as any);
  await updateBusiness(db as any, b.id, { name: 'Ada Couture', paymentAccountNumber: '0123456789' });
  const clientId = await createClient(db as any, b.id, 'Tunde Bakare');
  const business = (await ensureBusiness(db as any))!;
  const docId = await createDocument(db as any, business);
  await updateDocument(db as any, docId, { clientId, vatEnabled: true });
  await addLine(db as any, docId, { description: 'Agbada', quantity: 1, unitPriceKobo: 4_000_000 });
  await addLine(db as any, docId, { description: 'Cap', quantity: 2, unitPriceKobo: 500_000 });
  return { db, businessId: b.id, clientId, docId };
}

test('backs up a phone and restores everything on a new phone', async () => {
  const remote = new FakeRemote();
  const a = await phoneWithInvoice();
  assert.ok((await countPending(a.db)) > 0);
  await sync(a.db, remote, USER);
  assert.equal(await countPending(a.db), 0);
  assert.equal(remote.live('document_lines').length, 2);

  // New phone: the welcome screen has already made an empty business.
  const b = await phone();
  await ensureBusiness(b as any);
  await sync(b, remote, USER);

  const biz = await ensureBusiness(b as any);
  assert.equal(biz.name, 'Ada Couture');
  assert.equal(biz.paymentAccountNumber, '0123456789');
  assert.equal(remote.live('businesses').length, 1, 'no second business in the cloud');
  const docs = await listDocuments(b as any, biz.id);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].number, 'INV-0001');
  assert.equal(docs[0].clientName, 'Tunde Bakare');
  assert.equal(docs[0].vatEnabled, true);
  assert.equal(docs[0].totalKobo, 5_375_000); // ₦50,000 + 7.5% VAT
  const lines = await getLines(b as any, docs[0].id);
  assert.deepEqual(lines.map((l) => [l.description, l.quantity, l.unitPriceKobo]), [
    ['Agbada', 1, 4_000_000],
    ['Cap', 2, 500_000],
  ]);
  assert.equal(await countPending(b), 0, 'restoring does not queue an upload');
});

test('edits travel both ways, and an unsent edit on this phone wins', async () => {
  const remote = new FakeRemote();
  const a = await phoneWithInvoice();
  await sync(a.db, remote, USER);
  const b = await phone();
  await sync(b, remote, USER);
  const bClient = (await listClients(b as any, (await ensureBusiness(b as any)).id))[0];

  await updateClient(a.db as any, a.clientId, { phone: '08031234567' });
  await sync(a.db, remote, USER);
  await sync(b, remote, USER);
  assert.equal((await listClients(b as any, (await ensureBusiness(b as any)).id))[0].phone, '08031234567');

  // Both phones change the name; B has not synced its change yet when A's arrives.
  await updateClient(a.db as any, a.clientId, { name: 'Tunde B.' });
  await sync(a.db, remote, USER);
  await updateClient(b as any, bClient.id, { name: 'Mr Tunde' });
  await sync(b, remote, USER);
  assert.equal((await listClients(b as any, (await ensureBusiness(b as any)).id))[0].name, 'Mr Tunde');
  await sync(a.db, remote, USER);
  assert.equal((await listClients(a.db as any, a.businessId))[0].name, 'Mr Tunde');
});

test('deletes reach the other phone', async () => {
  const remote = new FakeRemote();
  const a = await phoneWithInvoice();
  await sync(a.db, remote, USER);
  const b = await phone();
  await sync(b, remote, USER);

  await deleteDocument(a.db as any, a.docId);
  await deleteClient(a.db as any, a.clientId);
  await sync(a.db, remote, USER);
  assert.equal(remote.live('documents').length, 0);
  assert.equal(remote.live('document_lines').length, 0);
  assert.equal(remote.live('clients').length, 0);

  await sync(b, remote, USER);
  const bizId = (await ensureBusiness(b as any)).id;
  assert.equal((await listDocuments(b as any, bizId)).length, 0);
  assert.equal((await listClients(b as any, bizId)).length, 0);
  const lines = await b.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM document_lines', []);
  assert.equal(lines?.n, 0);
});

test('a new phone that already has a business keeps its details and merges into the account', async () => {
  const remote = new FakeRemote();
  const a = await phoneWithInvoice();
  await sync(a.db, remote, USER);

  const b = await phone();
  const bb = await ensureBusiness(b as any);
  await updateBusiness(b as any, bb.id, { name: 'Ada Couture Ltd' });
  const bBiz = await ensureBusiness(b as any);
  const bDoc = await createDocument(b as any, bBiz); // Also INV-0001, made offline.
  await addLine(b as any, bDoc, { description: 'Kaftan', quantity: 1, unitPriceKobo: 2_500_000 });
  await sync(b, remote, USER);

  assert.equal(remote.live('businesses').length, 1);
  assert.equal(remote.live('businesses')[0].name, 'Ada Couture Ltd');
  const numbers = (await listDocuments(b as any, bBiz.id)).map((d) => d.number).sort();
  assert.deepEqual(numbers, ['INV-0001', 'INV-0002'], 'the clash was renumbered');

  await sync(b, remote, USER);
  await sync(a.db, remote, USER);
  const aNumbers = (await listDocuments(a.db as any, a.businessId)).map((d) => d.number).sort();
  assert.deepEqual(aNumbers, ['INV-0001', 'INV-0002']);
  assert.equal((await ensureBusiness(a.db as any)).name, 'Ada Couture Ltd');
});

test('refuses to mix two accounts on one phone', async () => {
  const remote = new FakeRemote();
  const a = await phoneWithInvoice();
  await sync(a.db, remote, USER);
  await assert.rejects(sync(a.db, remote, 'user-b'), OtherAccountError);
});

test('a dropped connection loses nothing; the next sync finishes the job', async () => {
  const remote = new FakeRemote();
  const a = await phoneWithInvoice();
  const before = await countPending(a.db);
  remote.failNext = true;
  await assert.rejects(sync(a.db, remote, USER), /Network request failed/);
  assert.equal(await countPending(a.db), before);
  await sync(a.db, remote, USER);
  assert.equal(await countPending(a.db), 0);
  assert.equal(remote.live('documents').length, 1);
});

test('any edit after a sync is queued again', async () => {
  const remote = new FakeRemote();
  const a = await phoneWithInvoice();
  await sync(a.db, remote, USER);
  await updateDocument(a.db as any, a.docId, { notes: 'Thank you' });
  assert.ok((await countPending(a.db)) >= 1);
  await sync(a.db, remote, USER);
  assert.equal(remote.live('documents')[0].notes, 'Thank you');
  assert.equal(await countPending(a.db), 0);
});

test('invoices made before this update get cloud ids and are queued for backup', async () => {
  const db = openTestDb();
  await db.execAsync(MIGRATIONS[0] + '; PRAGMA user_version = 1;');
  await db.runAsync("INSERT INTO businesses (name) VALUES ('Ada Couture')", []);
  await db.runAsync("INSERT INTO clients (business_id, name) VALUES (1, 'Tunde'), (1, 'Kemi')", []);
  await migrate(db as any);
  const rows = await db.getAllAsync<{ uid: string }>('SELECT uid FROM clients', []);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.match(r.uid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(rows[0].uid, rows[1].uid);
  assert.equal(await countPending(db), 3);
});

test('payments back up and restore with their invoice', async () => {
  const remote = new FakeRemote();
  const { db, docId } = await phoneWithInvoice();
  await addPayment(db as any, docId, { amountKobo: 2_000_000, paidOn: '2026-10-12', method: 'transfer', note: 'Deposit' });
  await sync(db, remote, USER);
  assert.equal(remote.live('payments').length, 1);

  const fresh = await phone();
  await sync(fresh, remote, USER);
  const [doc] = await listDocuments(fresh as any, 1);
  assert.equal(doc.paidKobo, 2_000_000);
  const [p] = await listPayments(fresh as any, doc.id);
  assert.deepEqual([p.paidOn, p.method, p.note], ['2026-10-12', 'transfer', 'Deposit']);
});

test('until the payments table exists in the cloud, backup of everything else still works', async () => {
  const remote = new FakeRemote();
  const missing = new Error("Could not find the table 'public.payments' in the schema cache");
  const realUpsert = remote.upsert.bind(remote);
  const realPull = remote.pull.bind(remote);
  remote.upsert = async (table, rows) => {
    if (table === 'payments') throw missing;
    return realUpsert(table, rows);
  };
  remote.pull = async (table, since, limit) => {
    if (table === 'payments') throw missing;
    return realPull(table, since, limit);
  };
  const { db, docId } = await phoneWithInvoice();
  await addPayment(db as any, docId, { amountKobo: 1_000_000, paidOn: '2026-10-12', method: 'cash', note: '' });
  await sync(db, remote, USER);
  assert.equal(remote.live('documents').length, 1);
  assert.equal(await countPending(db), 1, 'the payment waits on the phone for the cloud table');
});

test('logo and colour back up; before their cloud columns exist, the rest of the business still does', async () => {
  const remote = new FakeRemote();
  const realUpsert = remote.upsert.bind(remote);
  let cloudHasBrand = false;
  remote.upsert = async (table, rows) => {
    if (table === 'businesses' && !cloudHasBrand && rows.some((r) => 'logo_data' in r)) {
      throw new Error("Could not find the 'brand_color' column of 'businesses' in the schema cache");
    }
    return realUpsert(table, rows);
  };
  const { db } = await phoneWithInvoice();
  await updateBusiness(db as any, 1, { logoData: 'data:image/png;base64,AAAA', brandColor: '#1F3A68' });
  await sync(db, remote, USER);
  assert.equal(remote.live('documents').length, 1, 'invoices still back up');
  assert.equal(remote.live('businesses')[0].name, 'Ada Couture');
  assert.equal(await countPending(db), 1, 'the business waits so its logo goes up later');

  // Pulling from a cloud without the columns leaves the phone's logo alone.
  await sync(db, remote, USER);
  assert.equal((await ensureBusiness(db as any)).logoData, 'data:image/png;base64,AAAA');

  // The owner runs the SQL: the next sync sends the logo, and a new phone restores it.
  cloudHasBrand = true;
  await sync(db, remote, USER);
  assert.equal(await countPending(db), 0);
  const fresh = await phone();
  await sync(fresh, remote, USER);
  const restored = await ensureBusiness(fresh as any);
  assert.deepEqual([restored.logoData, restored.brandColor], ['data:image/png;base64,AAAA', '#1F3A68']);
});
