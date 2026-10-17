import type { SQLiteDatabase } from 'expo-sqlite';

export const SYNCED_TABLES = ['businesses', 'clients', 'items', 'documents', 'document_lines', 'payments'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

// A random UUID made inside SQLite, so new rows get one without every insert having to pass it.
const NEW_UID = `lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-'
  || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))`;

// Each entry runs once, in order. Never edit a shipped migration; add a new one.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    tax_id TEXT NOT NULL DEFAULT '',
    default_currency TEXT NOT NULL DEFAULT 'NGN',
    vat_default INTEGER NOT NULL DEFAULT 0,
    payment_bank_name TEXT NOT NULL DEFAULT '',
    payment_account_number TEXT NOT NULL DEFAULT '',
    payment_account_name TEXT NOT NULL DEFAULT '',
    default_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    default_price_kobo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    client_id INTEGER REFERENCES clients(id),
    type TEXT NOT NULL DEFAULT 'invoice',
    number TEXT NOT NULL,
    seq INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'NGN',
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    terms_days INTEGER,
    discount_type TEXT NOT NULL DEFAULT 'flat',
    discount_flat_kobo INTEGER NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    vat_enabled INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    total_kobo INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (business_id, type, seq)
  );
  CREATE TABLE document_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL DEFAULT 1,
    unit_price_kobo INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_documents_business ON documents(business_id, updated_at);
  CREATE INDEX idx_lines_document ON document_lines(document_id, position);
  `,
  syncMigration(['businesses', 'clients', 'items', 'documents', 'document_lines'], true),
  // Milestone 4: payments, so an invoice can take a deposit and part payments, and Reports use real payment days.
  `
  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    amount_kobo INTEGER NOT NULL DEFAULT 0,
    paid_on TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'transfer',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_payments_document ON payments(document_id, paid_on);
  ${syncMigration(['payments'], false)}
  `,
  // Your brand: logo and colour on invoices, receipts and statements. Backed up with the business.
  `
  ALTER TABLE businesses ADD COLUMN logo_data TEXT NOT NULL DEFAULT '';
  ALTER TABLE businesses ADD COLUMN brand_color TEXT NOT NULL DEFAULT '';
  `,
];

// Milestone 2: backup and sync.
// - uid: the row's id in the cloud, the same on every phone.
// - rev / synced_rev: rev goes up on every local change; the row needs uploading while synced_rev < rev.
//   Triggers bump rev, so app code never has to remember to.
// - sync_tombstones: rows deleted on this phone that the cloud still has.
function syncMigration(tables: readonly SyncedTable[], withMeta: boolean): string {
  const perTable = tables.map(
    (t) => `
  ALTER TABLE ${t} ADD COLUMN uid TEXT;
  ALTER TABLE ${t} ADD COLUMN rev INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE ${t} ADD COLUMN synced_rev INTEGER NOT NULL DEFAULT 0;
  UPDATE ${t} SET uid = ${NEW_UID};
  CREATE UNIQUE INDEX idx_${t}_uid ON ${t}(uid);
  CREATE INDEX idx_${t}_dirty ON ${t}(synced_rev, rev);
  CREATE TRIGGER trg_${t}_uid AFTER INSERT ON ${t} WHEN NEW.uid IS NULL
  BEGIN UPDATE ${t} SET uid = ${NEW_UID} WHERE id = NEW.id; END;
  CREATE TRIGGER trg_${t}_rev AFTER UPDATE ON ${t} WHEN NEW.rev = OLD.rev AND NEW.synced_rev = OLD.synced_rev
  BEGIN UPDATE ${t} SET rev = rev + 1 WHERE id = NEW.id; END;
  CREATE TRIGGER trg_${t}_del AFTER DELETE ON ${t} WHEN OLD.synced_rev > 0
  BEGIN INSERT OR REPLACE INTO sync_tombstones (tbl, uid) VALUES ('${t}', OLD.uid); END;`,
  ).join('\n');
  const meta = withMeta
    ? `CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE sync_tombstones (tbl TEXT NOT NULL, uid TEXT NOT NULL, PRIMARY KEY (tbl, uid));`
    : '';
  return `
  ${meta}
  ${perTable}
  `;
}

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
