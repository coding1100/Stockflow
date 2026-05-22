import 'dotenv/config';
import { logger } from '@stockflow/config/logger';
import { runMaterializer } from './materializer.js';
import { startJobs } from './jobs.js';

const log = logger.child({ app: 'worker' });

async function main() {
  log.info('StockFlow worker starting');
  const controller = new AbortController();
  const { worker, queue } = startJobs();

  const shutdown = async () => {
    log.info('shutting down');
    controller.abort();
    await worker.close();
    await queue.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await runMaterializer(controller.signal);
}

main().catch((err) => {
  log.error({ err }, 'worker crashed');
  process.exit(1);
});
