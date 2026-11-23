import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiSetupStatus, LocalAiHealth } from '@/game/deckGenerator/contract';
import { cancelLocalAiSetup, getLocalAiHealth, startLocalAiSetup } from '@/lib/localAiClient';

/** States that change on their own, so they are polled; the rest wait for the player. */
const TRANSIENT: AiSetupStatus[] = ['service_starting', 'runtime_downloading', 'runtime_ready', 'model_downloading', 'model_loading'];
export const POLL_MS = 1000;
/** The service may still be booting next to the dev server: retry a few times before giving up. */
export const UNREACHABLE_RETRIES = 5;
export const UNREACHABLE_RETRY_MS = 1500;

export interface LocalAiStatusApi {
  getHealth: typeof getLocalAiHealth;
  startSetup: typeof startLocalAiSetup;
  cancelSetup: typeof cancelLocalAiSetup;
}

const defaultApi: LocalAiStatusApi = { getHealth: getLocalAiHealth, startSetup: startLocalAiSetup, cancelSetup: cancelLocalAiSetup };

/**
 * Real state of the local AI subsystem, polled only while `active` (e.g. the dialog is open), only for transient
 * states, one request at a time, and stopped on unmount.
 */
export function useLocalAiStatus(active: boolean, api: LocalAiStatusApi = defaultApi) {
  const [health, setHealth] = useState<LocalAiHealth | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let failures = 0;

    const tick = async () => {
      controller = new AbortController();
      try {
        const next = await apiRef.current.getHealth({ signal: controller.signal });
        if (cancelled) return;
        failures = 0;
        setUnreachable(false);
        setHealth(next);
        if (TRANSIENT.includes(next.status)) timer = setTimeout(tick, POLL_MS);
      } catch {
        if (cancelled) return;
        failures++;
        if (failures > UNREACHABLE_RETRIES) {
          setHealth(null);
          setUnreachable(true);
          return;
        }
        timer = setTimeout(tick, UNREACHABLE_RETRY_MS);
      }
    };
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [active, pollKey]);

  const refresh = useCallback(() => {
    setUnreachable(false);
    setPollKey((k) => k + 1);
  }, []);

  const run = useCallback(async (action: 'startSetup' | 'cancelSetup') => {
    setBusy(true);
    try {
      setHealth(await apiRef.current[action]());
    } catch {
      // The next poll reports the real state (or the service as unreachable)
    } finally {
      setBusy(false);
      setPollKey((k) => k + 1);
    }
  }, []);

  const prepare = useCallback(() => run('startSetup'), [run]);
  const cancel = useCallback(() => run('cancelSetup'), [run]);

  return { health, unreachable, busy, refresh, prepare, cancel };
}
