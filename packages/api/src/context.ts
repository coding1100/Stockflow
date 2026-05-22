import { prisma, forTenant, type TenantClient } from '@stockflow/db';
import { logger } from '@stockflow/config/logger';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'OPERATIONS_LEAD' | 'RECEIVING_CLERK' | 'PICKER' | 'VENDOR_MANAGER' | 'ADMIN';
  tenantId: string;
  warehouseId: string;
}

export interface Context {
  user: SessionUser | null;
  /** Tenant-scoped client; only present when authenticated. */
  db: TenantClient | null;
  /** Raw client for cross-cutting reads (rare). */
  prisma: typeof prisma;
  log: typeof logger;
}

/**
 * Build a request context from an already-resolved session (the Next.js route handler
 * resolves the NextAuth session and passes the user in). Keeping context creation
 * framework-agnostic means the router can later be served from a standalone API server
 * without change.
 */
export function createContext(user: SessionUser | null): Context {
  return {
    user,
    db: user ? forTenant(user.tenantId) : null,
    prisma,
    log: logger,
  };
}
