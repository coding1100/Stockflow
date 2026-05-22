import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context, SessionUser } from './context.js';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter: ({ shape }) => shape,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires an authenticated user; narrows ctx.user / ctx.db to non-null. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.db) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in required' });
  }
  return next({ ctx: { ...ctx, user: ctx.user, db: ctx.db } });
});

/** Restrict a procedure to specific roles (ADMIN always allowed). */
export function roleProcedure(...roles: SessionUser['role'][]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== 'ADMIN' && !roles.includes(ctx.user.role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient role' });
    }
    return next({ ctx });
  });
}

export const opsLeadProcedure = roleProcedure('OPERATIONS_LEAD');
export const pickerProcedure = roleProcedure('PICKER', 'OPERATIONS_LEAD');
