import type { SQLiteDatabase } from 'expo-sqlite';
import { computeTotals } from '../lib/money.ts';
import { addDays, today } from '../lib/dates.ts';
import { documentNumber } from '../lib/format.ts';
import {
  DOC_PREFIX,
  type BillrDocument,
  type Business,
  type Client,
  type DocType,
  type DocumentLine,
  type Item,
  type Payment,
} from '../lib/types.ts';

type Row = Record<string, any>;

// Whitelists map app field names to columns, so no caller can write arbitrary SQL.
const BUSINESS_COLS: Record<keyof Omit<Business, 'id'>, string> = {
  name: 'name',
  ownerName: 'owner_name',
  phone: 'phone',
  email: 'email',
  address: 'address',
  taxId: 'tax_id',
  defaultCurrency: 'default_currency',
  vatDefault: 'vat_default',
  paymentBankName: 'payment_bank_name',
  paymentAccountNumber: 'payment_account_number',
  paymentAccountName: 'payment_account_name',
  defaultNotes: 'default_notes',
  logoData: 'logo_data',
  brandColor: 'brand_color',
};

const CLIENT_COLS: Record<keyof Omit<Client, 'id'>, string> = {
  name: 'name',
  phone: 'phone',
  email: 'email',
  address: 'address',
  notes: 'notes',
};

const ITEM_COLS: Record<keyof Omit<Item, 'id'>, string> = {
  name: 'name',
  details: 'details',
  defaultPriceKobo: 'default_price_kobo',
};

const DOC_COLS: Partial<Record<keyof BillrDocument, string>> = {
  clientId: 'client_id',
  currency: 'currency',
  issueDate: 'issue_date',
  dueDate: 'due_date',
  termsDays: 'terms_days',
  discountType: 'discount_type',
  discountFlatKobo: 'discount_flat_kobo',
  discountPercent: 'discount_percent',
  vatEnabled: 'vat_enabled',
  notes: 'notes',
  status: 'status',
};

const LINE_COLS: Partial<Record<keyof DocumentLine, string>> = {
  description: 'description',
  quantity: 'quantity',
  unitPriceKobo: 'unit_price_kobo',
};

function toSql(v: unknown): string | number | null {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined) return null;
  return v as string | number | null;
}

async function updateColumns(
  db: SQLiteDatabase,
  table: string,
  cols: Record<string, string | undefined>,
  id: number,
  patch: Record<string, unknown>,
  touch = true,
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const col = cols[key];
    if (!col) throw new Error(`Unknown field ${table}.${key}`);
    sets.push(`${col} = ?`);
    values.push(toSql(value));
  }
  if (sets.length === 0) return;
  if (touch) sets.push(`updated_at = datetime('now')`);
  await db.runAsync(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
}

// ---------- Business ----------

function toBusiness(r: Row): Business {
  return {
    id: r.id,
    name: r.name,
    ownerName: r.owner_name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    taxId: r.tax_id,
    defaultCurrency: r.default_currency,
    vatDefault: !!r.vat_default,
    paymentBankName: r.payment_bank_name,
    paymentAccountNumber: r.payment_account_number,
    paymentAccountName: r.payment_account_name,
    defaultNotes: r.default_notes,
    logoData: r.logo_data ?? '',
    brandColor: r.brand_color ?? '',
  };
}

export async function getBusiness(db: SQLiteDatabase): Promise<Business | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM businesses ORDER BY id LIMIT 1');
  return r ? toBusiness(r) : null;
}

export async function ensureBusiness(db: SQLiteDatabase): Promise<Business> {
  const existing = await getBusiness(db);
  if (existing) return existing;
  await db.runAsync('INSERT INTO businesses DEFAULT VALUES');
  return (await getBusiness(db))!;
}

export function updateBusiness(db: SQLiteDatabase, id: number, patch: Partial<Omit<Business, 'id'>>) {
  return updateColumns(db, 'businesses', BUSINESS_COLS, id, patch);
}

// ---------- Clients ----------

function toClient(r: Row): Client {
  return { id: r.id, name: r.name, phone: r.phone, email: r.email, address: r.address, notes: r.notes };
}

export async function listClients(db: SQLiteDatabase, businessId: number): Promise<(Client & { owedKobo: number })[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT c.*, COALESCE((SELECT SUM(d.total_kobo - ${PAID_SQL}) FROM documents d
        WHERE d.client_id = c.id AND d.type = 'invoice' AND d.status = 'sent'), 0) AS owed
     FROM clients c WHERE c.business_id = ? AND c.name != '' ORDER BY c.name COLLATE NOCASE`,
    [businessId],
  );
  return rows.map((r) => ({ ...toClient(r), owedKobo: r.owed }));
}

export async function getClient(db: SQLiteDatabase, id: number): Promise<Client | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM clients WHERE id = ?', [id]);
  return r ? toClient(r) : null;
}

export async function createClient(db: SQLiteDatabase, businessId: number, name = ''): Promise<number> {
  const res = await db.runAsync('INSERT INTO clients (business_id, name) VALUES (?, ?)', [businessId, name]);
  return res.lastInsertRowId;
}

export function updateClient(db: SQLiteDatabase, id: number, patch: Partial<Omit<Client, 'id'>>) {
  return updateColumns(db, 'clients', CLIENT_COLS, id, patch);
}

export async function deleteClient(db: SQLiteDatabase, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE documents SET client_id = NULL WHERE client_id = ?', [id]);
    await db.runAsync('DELETE FROM clients WHERE id = ?', [id]);
  });
}

// ---------- Items ----------

function toItem(r: Row): Item {
  return { id: r.id, name: r.name, details: r.details, defaultPriceKobo: r.default_price_kobo };
}

export async function listItems(db: SQLiteDatabase, businessId: number): Promise<Item[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM items WHERE business_id = ? AND name != '' ORDER BY name COLLATE NOCASE`,
    [businessId],
  );
  return rows.map(toItem);
}

export async function getItem(db: SQLiteDatabase, id: number): Promise<Item | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM items WHERE id = ?', [id]);
  return r ? toItem(r) : null;
}

export async function createItem(db: SQLiteDatabase, businessId: number): Promise<number> {
  const res = await db.runAsync('INSERT INTO items (business_id) VALUES (?)', [businessId]);
  return res.lastInsertRowId;
}

export function updateItem(db: SQLiteDatabase, id: number, patch: Partial<Omit<Item, 'id'>>) {
  return updateColumns(db, 'items', ITEM_COLS, id, patch);
}

export async function deleteItem(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM items WHERE id = ?', [id]);
}

// ---------- Documents ----------

function toDoc(r: Row): BillrDocument {
  return {
    id: r.id,
    type: r.type,
    number: r.number,
    clientId: r.client_id,
    currency: r.currency,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    termsDays: r.terms_days,
    discountType: r.discount_type,
    discountFlatKobo: r.discount_flat_kobo,
    discountPercent: r.discount_percent,
    vatEnabled: !!r.vat_enabled,
    notes: r.notes,
    status: r.status,
    totalKobo: r.total_kobo,
    sentAt: r.sent_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toLine(r: Row): DocumentLine {
  return {
    id: r.id,
    documentId: r.document_id,
    position: r.position,
    description: r.description,
    quantity: r.quantity,
    unitPriceKobo: r.unit_price_kobo,
  };
}

// Money received so far on the document d.
const PAID_SQL = '(SELECT COALESCE(SUM(p.amount_kobo), 0) FROM payments p WHERE p.document_id = d.id)';

export type DocListRow = BillrDocument & { clientName: string | null; paidKobo: number; payments: Pick<Payment, 'amountKobo' | 'paidOn' | 'method' | 'note'>[] };

export async function listDocuments(db: SQLiteDatabase, businessId: number): Promise<DocListRow[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT d.*, c.name AS client_name FROM documents d LEFT JOIN clients c ON c.id = d.client_id
     WHERE d.business_id = ? ORDER BY d.updated_at DESC, d.id DESC`,
    [businessId],
  );
  const pays = await db.getAllAsync<Row>(
    `SELECT p.document_id, p.amount_kobo, p.paid_on, p.method, p.note FROM payments p JOIN documents d ON d.id = p.document_id
     WHERE d.business_id = ? ORDER BY p.paid_on, p.id`,
    [businessId],
  );
  const byDoc = new Map<number, DocListRow['payments']>();
  for (const p of pays) {
    const list = byDoc.get(p.document_id) ?? [];
    list.push({ amountKobo: p.amount_kobo, paidOn: p.paid_on, method: p.method, note: p.note });
    byDoc.set(p.document_id, list);
  }
  return rows.map((r) => {
    const payments = byDoc.get(r.id) ?? [];
    return { ...toDoc(r), clientName: r.client_name, payments, paidKobo: payments.reduce((s, p) => s + p.amountKobo, 0) };
  });
}

export async function getDocument(db: SQLiteDatabase, id: number): Promise<BillrDocument | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM documents WHERE id = ?', [id]);
  return r ? toDoc(r) : null;
}

export async function getLines(db: SQLiteDatabase, documentId: number): Promise<DocumentLine[]> {
  const rows = await db.getAllAsync<Row>(
    'SELECT * FROM document_lines WHERE document_id = ? ORDER BY position, id',
    [documentId],
  );
  return rows.map(toLine);
}

export async function createDocument(db: SQLiteDatabase, business: Business, type: DocType = 'invoice'): Promise<number> {
  let id = 0;
  await db.withTransactionAsync(async () => {
    const next = await db.getFirstAsync<{ seq: number }>(
      'SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM documents WHERE business_id = ? AND type = ?',
      [business.id, type],
    );
    const seq = next?.seq ?? 1;
    const issue = today();
    const days = DEFAULT_DAYS[type];
    const res = await db.runAsync(
      `INSERT INTO documents (business_id, type, number, seq, currency, issue_date, due_date, terms_days, vat_enabled, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [business.id, type, documentNumber(DOC_PREFIX[type], seq), seq, business.defaultCurrency, issue, addDays(issue, days), days,
        business.vatDefault ? 1 : 0, business.defaultNotes],
    );
    id = res.lastInsertRowId;
  });
  return id;
}

// Invoices and proformas are due in 7 days; a quote stays valid for 14.
const DEFAULT_DAYS: Record<DocType, number> = { invoice: 7, proforma: 7, quote: 14 };

// Turns a quote into a proforma or invoice (or a proforma into an invoice): same client, items, discount,
// VAT and notes, a fresh number and dates. The source is marked converted so it leaves "Awaiting reply".
export async function convertDocument(db: SQLiteDatabase, sourceId: number, type: DocType): Promise<number> {
  const src = await getDocument(db, sourceId);
  if (!src) throw new Error('Document not found');
  const lines = await getLines(db, sourceId);
  let id = 0;
  await db.withTransactionAsync(async () => {
    const r = await db.getFirstAsync<{ business_id: number }>('SELECT business_id FROM documents WHERE id = ?', [sourceId]);
    const businessId = r!.business_id;
    const next = await db.getFirstAsync<{ seq: number }>(
      'SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM documents WHERE business_id = ? AND type = ?',
      [businessId, type],
    );
    const seq = next?.seq ?? 1;
    const issue = today();
    const days = DEFAULT_DAYS[type];
    const res = await db.runAsync(
      `INSERT INTO documents (business_id, client_id, type, number, seq, currency, issue_date, due_date, terms_days,
         discount_type, discount_flat_kobo, discount_percent, vat_enabled, notes, total_kobo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, src.clientId, type, documentNumber(DOC_PREFIX[type], seq), seq, src.currency, issue, addDays(issue, days), days,
        src.discountType, src.discountFlatKobo, src.discountPercent, src.vatEnabled ? 1 : 0, src.notes, src.totalKobo],
    );
    id = res.lastInsertRowId;
    for (const l of lines) {
      await db.runAsync(
        'INSERT INTO document_lines (document_id, position, description, quantity, unit_price_kobo) VALUES (?, ?, ?, ?, ?)',
        [id, l.position, l.description, l.quantity, l.unitPriceKobo],
      );
    }
    await db.runAsync(`UPDATE documents SET status = 'converted', updated_at = datetime('now') WHERE id = ?`, [sourceId]);
  });
  return id;
}

// Keeps the stored total in step with lines and settings so lists never show a stale amount.
async function refreshTotal(db: SQLiteDatabase, documentId: number): Promise<void> {
  const doc = await getDocument(db, documentId);
  if (!doc) return;
  const lines = await getLines(db, documentId);
  const { totalKobo } = computeTotals({ ...doc, lines });
  await db.runAsync(`UPDATE documents SET total_kobo = ?, updated_at = datetime('now') WHERE id = ?`, [totalKobo, documentId]);
  await refreshPaid(db, documentId);
}

export async function updateDocument(db: SQLiteDatabase, id: number, patch: Partial<BillrDocument>): Promise<void> {
  await updateColumns(db, 'documents', DOC_COLS, id, patch);
  await refreshTotal(db, id);
}

export async function markSent(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(
    `UPDATE documents SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
       sent_at = COALESCE(sent_at, datetime('now')), updated_at = datetime('now') WHERE id = ?`,
    [id],
  );
}

export async function deleteDocument(db: SQLiteDatabase, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM document_lines WHERE document_id = ?', [id]);
    await db.runAsync('DELETE FROM payments WHERE document_id = ?', [id]);
    await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
  });
}

export async function addLine(
  db: SQLiteDatabase,
  documentId: number,
  line: { description?: string; quantity?: number; unitPriceKobo?: number } = {},
): Promise<number> {
  const pos = await db.getFirstAsync<{ p: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM document_lines WHERE document_id = ?',
    [documentId],
  );
  const res = await db.runAsync(
    'INSERT INTO document_lines (document_id, position, description, quantity, unit_price_kobo) VALUES (?, ?, ?, ?, ?)',
    [documentId, pos?.p ?? 0, line.description ?? '', line.quantity ?? 1, line.unitPriceKobo ?? 0],
  );
  await refreshTotal(db, documentId);
  return res.lastInsertRowId;
}

export async function updateLine(db: SQLiteDatabase, line: DocumentLine, patch: Partial<DocumentLine>): Promise<void> {
  await updateColumns(db, 'document_lines', LINE_COLS, line.id, patch, false);
  await refreshTotal(db, line.documentId);
}

export async function deleteLine(db: SQLiteDatabase, line: DocumentLine): Promise<void> {
  await db.runAsync('DELETE FROM document_lines WHERE id = ?', [line.id]);
  await refreshTotal(db, line.documentId);
}

// ---------- Payments ----------

function toPayment(r: Row): Payment {
  return { id: r.id, documentId: r.document_id, amountKobo: r.amount_kobo, paidOn: r.paid_on, method: r.method, note: r.note };
}

export async function listPayments(db: SQLiteDatabase, documentId: number): Promise<Payment[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM payments WHERE document_id = ? ORDER BY paid_on, id', [documentId]);
  return rows.map(toPayment);
}

export async function addPayment(db: SQLiteDatabase, documentId: number, p: Omit<Payment, 'id' | 'documentId'>): Promise<number> {
  const res = await db.runAsync('INSERT INTO payments (document_id, amount_kobo, paid_on, method, note) VALUES (?, ?, ?, ?, ?)', [
    documentId,
    p.amountKobo,
    p.paidOn,
    p.method,
    p.note,
  ]);
  await refreshPaid(db, documentId);
  return res.lastInsertRowId;
}

export async function deletePayment(db: SQLiteDatabase, payment: Payment): Promise<void> {
  await db.runAsync('DELETE FROM payments WHERE id = ?', [payment.id]);
  await refreshPaid(db, payment.documentId);
}

// An invoice is paid once its payments cover the total, and is sent (still owed) while they fall short, so it
// goes back to sent if a payment is removed or the total grows. Invoices marked paid before payments existed have none and are left as they are.
async function refreshPaid(db: SQLiteDatabase, documentId: number): Promise<void> {
  const r = await db.getFirstAsync<Row>(
    `SELECT d.type, d.status, d.total_kobo, COUNT(p.id) AS n, COALESCE(SUM(p.amount_kobo), 0) AS paid
     FROM documents d LEFT JOIN payments p ON p.document_id = d.id WHERE d.id = ? GROUP BY d.id`,
    [documentId],
  );
  if (!r || r.type !== 'invoice' || r.n === 0) return;
  const full = r.total_kobo > 0 && r.paid >= r.total_kobo;
  // A deposit means the client has the invoice, so a part-paid draft counts as sent (and as money still owed).
  const status = full ? 'paid' : 'sent';
  if (status !== r.status) {
    await db.runAsync(`UPDATE documents SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, documentId]);
  }
}
