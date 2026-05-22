import { PrismaClient } from '@prisma/client';

/**
 * Process-wide Prisma singleton. Next.js dev hot-reload would otherwise spawn a new
 * client (and connection pool) on every reload, exhausting Postgres connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
