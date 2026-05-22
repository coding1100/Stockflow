import { prisma, DEMO_WAREHOUSE_ID } from '@stockflow/db';
import { verifyPassword } from '@stockflow/config/password';
import type { SessionUser } from './context.js';

/**
 * Verify email+password against the seeded users. Used by the NextAuth credentials
 * provider. Returns the session user (incl. tenant/warehouse) or null.
 */
export async function verifyUserCredentials(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    warehouseId: DEMO_WAREHOUSE_ID,
  };
}
