import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncedTable } from '../db/schema';
import type { Remote, RemoteRow } from './engine';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async upsert(table: SyncedTable, rows: Record<string, unknown>[]) {
      check(await client.from(table).upsert(rows, { onConflict: 'id' }));
    },
    async markDeleted(table: SyncedTable, ids: string[]) {
      for (let i = 0; i < ids.length; i += 200) {
        check(await client.from(table).update({ deleted: true }).in('id', ids.slice(i, i + 200)));
      }
    },
    async pull(table: SyncedTable, since: string | null, limit: number) {
      let q = client.from(table).select('*').eq('user_id', userId);
      if (since) q = q.gte('synced_at', since);
      return check(await q.order('synced_at').limit(limit)) as RemoteRow[];
    },
    async firstBusiness() {
      const rows = check(
        await client.from('businesses').select('*').eq('user_id', userId).eq('deleted', false).order('created_at').limit(1),
      ) as RemoteRow[];
      return rows[0] ?? null;
    },
  };
}
