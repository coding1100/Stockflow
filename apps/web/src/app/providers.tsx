'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import { TRPCProvider } from '@/lib/trpc/react';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <TRPCProvider>{children}</TRPCProvider>
      <ServiceWorkerRegister />
    </SessionProvider>
  );
}
