// Test helpers: a real SQLite database (node:sqlite) behind the expo-sqlite calls the app uses,
// and an in-memory stand-in for the Supabase tables.
import { DatabaseSync } from 'node:sqlite';
import { SYNCED_TABLES, type SyncedTable } from '../db/schema.ts';
import type { Remote, RemoteRow } from './engine.ts';

type Param = string | number | null;

export function openTestDb() {
  const raw = new DatabaseSync(':memory:');
  const db = {
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async getAllAsync<T>(sql: string, params: Param[] = []): Promise<T[]> {
      return raw.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: Param[] = []): Promise<T | null> {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async runAsync(sql: string, params: Param[] = []) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return db;
}

export type TestDb = ReturnType<typeof openTestDb>;

export class FakeRemote implements Remote {
  tables: Record<SyncedTable, Map<string, RemoteRow>> = Object.fromEntries(
    SYNCED_TABLES.map((t) => [t, new Map<string, RemoteRow>()]),
  ) as Record<SyncedTable, Map<string, RemoteRow>>;
  private clock = Date.parse('2026-10-16T12:00:00Z');
  failNext = false;

  private stamp(): string {
    this.clock += 1000;
    // Same shape Postgres sends, microseconds included.
    return new Date(this.clock).toISOString().replace('Z', '123+00:00');
  }

  private check() {
    if (this.failNext) {
      this.failNext = false;
      throw new TypeError('Network request failed');
    }
  }

  async upsert(table: SyncedTable, rows: Record<string, unknown>[]) {
    this.check();
    for (const r of rows) {
      const prev = this.tables[table].get(r.id as string);
      if (prev && prev.user_id !== r.user_id) throw new Error('row-level security');
      this.tables[table].set(r.id as string, { ...prev, ...r, synced_at: this.stamp() } as RemoteRow);
    }
  }

  async markDeleted(table: SyncedTable, ids: string[]) {
    this.check();
    for (const id of ids) {
      const prev = this.tables[table].get(id);
      if (prev) this.tables[table].set(id, { ...prev, deleted: true, synced_at: this.stamp() });
    }
  }

  async pull(table: SyncedTable, since: string | null, limit: number) {
    this.check();
    const norm = (s: string) => Date.parse(s.replace(/(\.\d{3})\d+/, '$1'));
    return [...this.tables[table].values()]
      .filter((r) => since === null || norm(r.synced_at) >= norm(since))
      .sort((a, b) => norm(a.synced_at) - norm(b.synced_at))
      .slice(0, limit);
  }

  async firstBusiness() {
    this.check();
    return [...this.tables.businesses.values()].find((b) => !b.deleted) ?? null;
  }

  live(table: SyncedTable) {
    return [...this.tables[table].values()].filter((r) => !r.deleted);
  }
}
