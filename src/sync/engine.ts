// Two-way sync between the phone's SQLite database (the source of truth) and the cloud copy.
// Plain TypeScript with no Expo imports, so the whole thing runs under `node --test`.
//
// One sync = adopt the cloud business on first sign-in, push local changes, then pull cloud changes.
// Conflicts: a row changed on this phone and not yet uploaded keeps the phone's version. A delete wins over an edit.
import { SYNCED_TABLES, type SyncedTable } from '../db/schema.ts';
import { documentNumber } from '../lib/format.ts';
import { DOC_PREFIX, type DocType } from '../lib/types.ts';

type Param = string | number | null;

// The few database calls sync needs. expo-sqlite's SQLiteDatabase fits this shape, and so does the test adapter.
export interface SyncDb {
  getAllAsync<T>(sql: string, params: Param[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: Param[]): Promise<T | null>;
  runAsync(sql: string, params: Param[]): Promise<unknown>;
}

export type RemoteRow = Record<string, unknown> & { id: string; synced_at: string; deleted?: boolean };

// The cloud side. The real one talks to Supabase (supabaseRemote.ts); tests use an in-memory one.
export interface Remote {
  upsert(table: SyncedTable, rows: Record<string, unknown>[]): Promise<void>;
  markDeleted(table: SyncedTable, ids: string[]): Promise<void>;
  // Rows with synced_at >= since (all rows when since is null), oldest first.
  pull(table: SyncedTable, since: string | null, limit: number): Promise<RemoteRow[]>;
  firstBusiness(): Promise<RemoteRow | null>;
}

type Ref = { col: string; table: SyncedTable; required: boolean };
type Spec = { cols: string[]; bools?: string[]; refs: Ref[] };

// Column names are the same on the phone and in the cloud. Refs hold local ids on the phone and uids in the cloud.
const SPECS: Record<SyncedTable, Spec> = {
  businesses: {
    cols: ['name', 'owner_name', 'phone', 'email', 'address', 'tax_id', 'default_currency', 'vat_default', 'payment_bank_name',
      'payment_account_number', 'payment_account_name', 'default_notes', 'created_at', 'updated_at'],
    bools: ['vat_default'],
    refs: [],
  },
  clients: {
    cols: ['name', 'phone', 'email', 'address', 'notes', 'created_at', 'updated_at'],
    refs: [{ col: 'business_id', table: 'businesses', required: true }],
  },
  items: {
    cols: ['name', 'details', 'default_price_kobo', 'created_at', 'updated_at'],
    refs: [{ col: 'business_id', table: 'businesses', required: true }],
  },
  documents: {
    cols: ['type', 'number', 'seq', 'currency', 'issue_date', 'due_date', 'terms_days', 'discount_type', 'discount_flat_kobo',
      'discount_percent', 'vat_enabled', 'notes', 'status', 'total_kobo', 'sent_at', 'created_at', 'updated_at'],
    bools: ['vat_enabled'],
    refs: [
      { col: 'business_id', table: 'businesses', required: true },
      { col: 'client_id', table: 'clients', required: false },
    ],
  },
  document_lines: {
    cols: ['position', 'description', 'quantity', 'unit_price_kobo'],
    refs: [{ col: 'document_id', table: 'documents', required: true }],
  },
  payments: {
    cols: ['amount_kobo', 'paid_on', 'method', 'note', 'created_at', 'updated_at'],
    refs: [{ col: 'document_id', table: 'documents', required: true }],
  },
};

// Tables added after the first cloud setup. Until the owner runs that table's SQL in Supabase, the cloud says it
// does not exist; sync then skips it (its rows wait on the phone) instead of failing the whole backup.
const ADDED_LATER: SyncedTable[] = ['payments'];

export function isMissingTable(e: unknown): boolean {
  return /schema cache|does not exist|PGRST205|42P01/i.test(String((e as Error)?.message ?? e));
}

async function tolerant(table: SyncedTable, work: () => Promise<number>): Promise<number> {
  try {
    return await work();
  } catch (e) {
    if (ADDED_LATER.includes(table) && isMissingTable(e)) return 0;
    throw e;
  }
}

const PUSH_BATCH = 200;
const PULL_PAGE = 500;
// Pulls re-read the last 2 minutes, so a change that was still being saved during the previous pull is not missed.
const PULL_OVERLAP_MS = 2 * 60 * 1000;

export class OtherAccountError extends Error {
  constructor() {
    super('This phone holds another account’s invoices');
    this.name = 'OtherAccountError';
  }
}

export async function getMeta(db: SyncDb, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setMeta(db: SyncDb, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [key, value]);
}

export async function countPending(db: SyncDb): Promise<number> {
  let n = 0;
  for (const t of SYNCED_TABLES) {
    const r = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE synced_rev < rev`, []);
    n += r?.n ?? 0;
  }
  const d = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_tombstones', []);
  return n + (d?.n ?? 0);
}

export type SyncResult = { pushed: number; pulled: number; at: string };

export async function sync(db: SyncDb, remote: Remote, userId: string, now: () => Date = () => new Date()): Promise<SyncResult> {
  const owner = await getMeta(db, 'owner_user_id');
  if (owner && owner !== userId) throw new OtherAccountError();
  if (!owner) {
    await adoptCloudBusiness(db, remote);
    await setMeta(db, 'owner_user_id', userId);
  }
  const pushed = await push(db, remote, userId);
  const pulled = await pull(db, remote);
  const at = now().toISOString();
  await setMeta(db, 'last_synced_at', at);
  return { pushed, pulled, at };
}

// First sign-in on this phone. If the account already has a business in the cloud, this phone's business becomes
// that same business, so a new phone restores into it instead of creating a second one.
// A business that was never filled in takes the cloud's details; one with details keeps them.
async function adoptCloudBusiness(db: SyncDb, remote: Remote): Promise<void> {
  const cloud = await remote.firstBusiness();
  if (!cloud) return;
  const local = await db.getFirstAsync<{ id: number; uid: string; name: string }>('SELECT id, uid, name FROM businesses ORDER BY id LIMIT 1', []);
  if (!local || local.uid === cloud.id) return;
  const keepLocal = local.name.trim() !== '';
  // Setting rev explicitly stops the trigger from counting this as an edit.
  await db.runAsync(
    `UPDATE businesses SET uid = ?, rev = rev + 1, synced_rev = ${keepLocal ? 'synced_rev' : 'rev + 1'} WHERE id = ?`,
    [cloud.id, local.id],
  );
}

async function push(db: SyncDb, remote: Remote, userId: string): Promise<number> {
  let count = 0;
  // Parents first, so a document never arrives before its client.
  for (const table of SYNCED_TABLES) count += await tolerant(table, () => pushTable(db, remote, userId, table));
  return count;
}

async function pushTable(db: SyncDb, remote: Remote, userId: string, table: SyncedTable): Promise<number> {
  let count = 0;
  const spec = SPECS[table];
  const joins = spec.refs.map((r, i) => `LEFT JOIN ${r.table} p${i} ON p${i}.id = t.${r.col}`).join(' ');
  const refCols = spec.refs.map((r, i) => `, p${i}.uid AS ref_${r.col}`).join('');
  for (;;) {
    const rows = await db.getAllAsync<Record<string, any>>(
      `SELECT t.*${refCols} FROM ${table} t ${joins} WHERE t.synced_rev < t.rev ORDER BY t.id LIMIT ${PUSH_BATCH}`,
      [],
    );
    if (rows.length === 0) break;
    const ready = rows.filter((r) => spec.refs.every((ref) => !ref.required || r[`ref_${ref.col}`]));
    if (ready.length) {
      await remote.upsert(table, ready.map((r) => toRemote(spec, r, userId)));
      for (const r of ready) {
        await db.runAsync(`UPDATE ${table} SET synced_rev = ? WHERE id = ?`, [r.rev, r.id]);
      }
      count += ready.length;
    }
    // A row whose parent is gone cannot be uploaded; stop rather than loop on it.
    if (ready.length < rows.length || rows.length < PUSH_BATCH) break;
  }
  const gone = await db.getAllAsync<{ uid: string }>('SELECT uid FROM sync_tombstones WHERE tbl = ?', [table]);
  if (gone.length) {
    const ids = gone.map((g) => g.uid);
    await remote.markDeleted(table, ids);
    for (const id of ids) await db.runAsync('DELETE FROM sync_tombstones WHERE tbl = ? AND uid = ?', [table, id]);
    count += ids.length;
  }
  return count;
}

function toRemote(spec: Spec, r: Record<string, any>, userId: string): Record<string, unknown> {
  const out: Record<string, unknown> = { id: r.uid, user_id: userId, deleted: false };
  for (const c of spec.cols) out[c] = spec.bools?.includes(c) ? !!r[c] : r[c];
  for (const ref of spec.refs) out[ref.col] = r[`ref_${ref.col}`] ?? null;
  return out;
}

async function pull(db: SyncDb, remote: Remote): Promise<number> {
  let count = 0;
  for (const table of SYNCED_TABLES) count += await tolerant(table, () => pullTable(db, remote, table));
  return count;
}

async function pullTable(db: SyncDb, remote: Remote, table: SyncedTable): Promise<number> {
  let count = 0;
  const key = `pulled_at:${table}`;
  const cursor = await getMeta(db, key);
  let since = cursor ? minusMs(cursor, PULL_OVERLAP_MS) : null;
  let newest = cursor;
  for (;;) {
    const rows = await remote.pull(table, since, PULL_PAGE);
    for (const row of rows) {
      if (await applyRow(db, table, row)) count += 1;
      if (!newest || row.synced_at > newest) newest = row.synced_at;
    }
    if (rows.length < PULL_PAGE) break;
    const last = rows[rows.length - 1].synced_at;
    if (last === since) break;
    since = last;
  }
  if (newest && newest !== cursor) await setMeta(db, key, newest);
  return count;
}

// Applies one cloud row. Returns true when it changed something on the phone.
async function applyRow(db: SyncDb, table: SyncedTable, row: RemoteRow): Promise<boolean> {
  const spec = SPECS[table];
  const local = await db.getFirstAsync<{ id: number; rev: number; synced_rev: number }>(
    `SELECT id, rev, synced_rev FROM ${table} WHERE uid = ?`,
    [row.id],
  );

  if (row.deleted) {
    if (!local) return false;
    await deleteLocal(db, table, local.id);
    await db.runAsync('DELETE FROM sync_tombstones WHERE tbl = ? AND uid = ?', [table, row.id]);
    return true;
  }

  // Changed on this phone and not uploaded yet: the phone's version wins and goes up on the next push.
  if (local && local.synced_rev < local.rev) return false;

  const values: Record<string, Param> = {};
  for (const c of spec.cols) {
    const v = row[c];
    values[c] = spec.bools?.includes(c) ? (v ? 1 : 0) : ((v ?? null) as Param);
  }
  for (const ref of spec.refs) {
    const uid = row[ref.col] as string | null;
    const parent = uid ? await db.getFirstAsync<{ id: number }>(`SELECT id FROM ${ref.table} WHERE uid = ?`, [uid]) : null;
    if (!parent && ref.required) return false;
    values[ref.col] = parent?.id ?? null;
  }

  if (table === 'documents') await freeDocumentNumber(db, values, local?.id ?? null);

  const cols = Object.keys(values);
  const params = cols.map((c) => values[c]);
  if (local) {
    // rev and synced_rev move together: the phone now matches the cloud, and the trigger stays quiet.
    await db.runAsync(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, rev = rev + 1, synced_rev = rev + 1 WHERE id = ? AND synced_rev = rev`,
      [...params, local.id],
    );
  } else {
    await db.runAsync(
      `INSERT INTO ${table} (uid, rev, synced_rev, ${cols.join(', ')}) VALUES (?, 1, 1, ${cols.map(() => '?').join(', ')})`,
      [row.id, ...params],
    );
  }
  return true;
}

// Two phones used offline can both make INV-0004. The incoming one keeps its number (it was synced first);
// the phone's own document moves to the next free number and uploads with it.
async function freeDocumentNumber(db: SyncDb, values: Record<string, Param>, ownId: number | null): Promise<void> {
  const clash = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM documents WHERE business_id = ? AND type = ? AND seq = ? AND id IS NOT ?',
    [values.business_id, values.type, values.seq, ownId],
  );
  if (!clash) return;
  const next = await db.getFirstAsync<{ seq: number }>(
    'SELECT MAX(COALESCE(MAX(seq), 0), ?) + 1 AS seq FROM documents WHERE business_id = ? AND type = ?',
    [values.seq, values.business_id, values.type],
  );
  const seq = next?.seq ?? 1;
  await db.runAsync('UPDATE documents SET seq = ?, number = ? WHERE id = ?', [
    seq,
    documentNumber(DOC_PREFIX[values.type as DocType], seq),
    clash.id,
  ]);
}

async function deleteLocal(db: SyncDb, table: SyncedTable, id: number): Promise<void> {
  if (table === 'businesses') return; // A business is never removed by sync.
  if (table === 'clients') await db.runAsync('UPDATE documents SET client_id = NULL WHERE client_id = ?', [id]);
  if (table === 'documents') {
    await db.runAsync('DELETE FROM document_lines WHERE document_id = ?', [id]);
    await db.runAsync('DELETE FROM payments WHERE document_id = ?', [id]);
  }
  await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
  // The delete trigger also queued this row (and any lines or payments) for upload as deleted. The caller clears the row's
  // own entry; re-sending a line's delete is harmless.
}

function minusMs(ts: string, ms: number): string {
  // Postgres sends microseconds; trim to milliseconds before parsing.
  const t = Date.parse(ts.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(t) ? ts : new Date(t - ms).toISOString();
}
