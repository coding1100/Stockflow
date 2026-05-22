import { getServerSession } from 'next-auth';
import type { SessionUser } from '@stockflow/api';
import { authOptions } from './auth';

/** Resolve the current request's session user for tRPC context + server components. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? '',
    role: session.user.role,
    tenantId: session.user.tenantId,
    warehouseId: session.user.warehouseId,
  };
}
