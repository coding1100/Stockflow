import { router } from './trpc.js';
import { inventoryRouter } from './routers/inventory.js';
import { pickingRouter } from './routers/picking.js';
import { dashboardRouter } from './routers/dashboard.js';
import { devRouter } from './routers/dev.js';

export const appRouter = router({
  inventory: inventoryRouter,
  picking: pickingRouter,
  dashboard: dashboardRouter,
  dev: devRouter,
});

export type AppRouter = typeof appRouter;
