'use client';

import { useEffect } from 'react';

/** Registers the offline service worker (production only — avoids dev HMR interference). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
