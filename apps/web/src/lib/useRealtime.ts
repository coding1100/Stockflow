'use client';

import { useEffect, useRef } from 'react';

export interface RealtimeMessage {
  topic: string;
  event: string;
  payload: unknown;
  at: string;
}

/**
 * Subscribe to an SSE topic. `onMessage` fires for each event; EventSource handles
 * reconnection automatically. Typically the handler invalidates a tRPC query so the
 * UI refetches — keeping cache logic in one place instead of manual patching.
 */
export function useRealtime(topic: string, onMessage: (msg: RealtimeMessage) => void): void {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const es = new EventSource(`/api/stream/${topic}`);
    es.onmessage = (e) => {
      try {
        handlerRef.current(JSON.parse(e.data) as RealtimeMessage);
      } catch {
        /* ignore keep-alive frames */
      }
    };
    es.onerror = () => {
      /* EventSource auto-reconnects */
    };
    return () => es.close();
  }, [topic]);
}
