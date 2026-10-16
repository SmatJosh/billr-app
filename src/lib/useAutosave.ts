import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Collects field changes and writes them to the local database shortly after typing stops.
// Pending changes are flushed when the screen closes, so nothing typed is ever dropped.
export function useAutosave<P extends object>(save: (patch: Partial<P>) => Promise<void>, delayMs = 300) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const pending = useRef<Partial<P>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    setStatus('saving');
    try {
      await saveRef.current(patch);
      setStatus('saved');
    } catch (e) {
      // Put the patch back so the next change or a retry writes it.
      pending.current = { ...patch, ...pending.current };
      setStatus('error');
      console.warn('Autosave failed', e);
    }
  }, []);

  const change = useCallback(
    (patch: Partial<P>) => {
      pending.current = { ...pending.current, ...patch };
      setStatus('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  useEffect(() => () => void flush(), [flush]);

  return { status, change, flush };
}
