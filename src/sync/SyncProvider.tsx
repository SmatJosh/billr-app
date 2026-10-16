import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useSQLiteContext } from 'expo-sqlite';
import { supabase } from '../lib/supabase';
import { countPending, getMeta, OtherAccountError, sync, type SyncDb } from './engine';
import { supabaseRemote } from './supabaseRemote';

export type SyncStatus = 'unavailable' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

type SyncState = {
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: string | null;
  pending: number;
  error: string | null;
  syncNow: () => Promise<boolean>;
  sendCode: (email: string) => Promise<void>;
  // Checks the emailed code, then runs the first sync (which restores a backup) before resolving.
  verifyCode: (email: string, code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const SyncContext = createContext<SyncState | null>(null);

// Check for unsent changes this often while the app is open; upload when there are any.
const CHECK_MS = 15_000;
// And fetch changes made on other phones at least this often.
const PULL_MS = 2 * 60_000;

function isOffline(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e);
  return /network request failed|failed to fetch|network|timeout/i.test(msg);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext() as unknown as SyncDb;
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>(supabase ? 'signed-out' : 'unavailable');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const lastRun = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    getMeta(db, 'last_synced_at').then(setLastSyncedAt).catch(() => {});
    countPending(db).then(setPending).catch(() => {});
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [db]);

  const syncNow = useCallback((): Promise<boolean> => {
    const s = sessionRef.current;
    if (!supabase || !s) return Promise.resolve(false);
    if (running.current) return running.current;
    const client = supabase;
    const run = (async () => {
      setStatus('syncing');
      try {
        const res = await sync(db, supabaseRemote(client, s.user.id), s.user.id);
        lastRun.current = Date.now();
        setLastSyncedAt(res.at);
        setError(null);
        setStatus('synced');
        return true;
      } catch (e) {
        if (e instanceof OtherAccountError) {
          setError('This phone already backs up to another account. Sign in with that account instead.');
          setStatus('error');
        } else if (isOffline(e)) {
          setError(null);
          setStatus('offline');
        } else {
          setError(String((e as Error)?.message ?? e));
          setStatus('error');
        }
        return false;
      } finally {
        setPending(await countPending(db).catch(() => 0));
        running.current = null;
      }
    })();
    running.current = run;
    return run;
  }, [db]);

  // Signed in: sync now, whenever the app comes back to the front, and on a timer while it is open.
  useEffect(() => {
    if (!supabase) return;
    if (!session) {
      setStatus('signed-out');
      return;
    }
    const client = supabase;
    client.auth.startAutoRefresh();
    syncNow();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        client.auth.startAutoRefresh();
        syncNow();
      } else {
        client.auth.stopAutoRefresh();
      }
    });
    const timer = setInterval(async () => {
      if (AppState.currentState !== 'active') return;
      const n = await countPending(db).catch(() => 0);
      setPending(n);
      if (n > 0 || Date.now() - lastRun.current > PULL_MS) syncNow();
    }, CHECK_MS);
    return () => {
      appState.remove();
      clearInterval(timer);
      client.auth.stopAutoRefresh();
    };
  }, [session?.user.id, db, syncNow]);

  const sendCode = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Backup is not set up in this version of the app');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      if (!supabase) throw new Error('Backup is not set up in this version of the app');
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw error;
      sessionRef.current = data.session;
      setSession(data.session);
      return syncNow();
    },
    [syncNow],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await syncNow(); // Upload anything left before the session goes.
    await supabase.auth.signOut();
  }, [syncNow]);

  return (
    <SyncContext.Provider
      value={{ status, email: session?.user.email ?? null, lastSyncedAt, pending, error, syncNow, sendCode, verifyCode, signOut }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be inside SyncProvider');
  return ctx;
}
