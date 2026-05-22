#!/usr/bin/env node
// One-command demo launcher.
//   1. brings up Postgres + Redis via Docker Compose
//   2. applies migrations + seeds the deterministic demo dataset
//   3. starts the worker (materializer + order-drip) and the web app
//   4. prints the local URL and a LAN URL for the phone (picker PWA)
//
// Data services run in Docker (robust real-time + offline); the Node apps run on the
// host for fast iteration. Ctrl+C tears everything down.

import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = ['compose', '-f', join(root, 'infra', 'docker-compose.yml')];
const scenario = process.env.SEED_SCENARIO ?? 'demo-default';

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', ...opts });
  if (res.status !== 0) {
    console.error(`\n✗ "${cmd} ${args.join(' ')}" failed`);
    process.exit(res.status ?? 1);
  }
}

function lanIp() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

async function waitForPostgres(retries = 30) {
  for (let i = 0; i < retries; i++) {
    const r = spawnSync('docker', [...compose, 'exec', '-T', 'postgres', 'pg_isready', '-U', 'stockflow'], { shell: process.platform === 'win32' });
    if (r.status === 0) return;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error('Postgres did not become ready');
}

console.log('\n🚀 StockFlow demo — starting…\n');

// 1. Docker daemon check
if (spawnSync('docker', ['info'], { stdio: 'ignore', shell: process.platform === 'win32' }).status !== 0) {
  console.error('✗ Docker is not running. Start Docker Desktop and retry.');
  process.exit(1);
}

// 2. Data services
console.log('▸ Starting Postgres + Redis…');
run('docker', [...compose, 'up', '-d']);
await waitForPostgres();

// 3. Migrate + seed
console.log('▸ Applying migrations…');
run('pnpm', ['--filter', '@stockflow/db', 'migrate:deploy']);
console.log(`▸ Seeding (${scenario})…`);
run('pnpm', ['--filter', '@stockflow/db', 'seed'], { env: { ...process.env, SEED_SCENARIO: scenario } });

// 4. Build web if needed
if (!existsSync(join(root, 'apps', 'web', '.next'))) {
  console.log('▸ Building web app (first run)…');
  run('pnpm', ['--filter', '@stockflow/web', 'build']);
}

// 5. Launch worker + web
const childEnv = { ...process.env, DEMO_ORDER_DRIP: 'on', NODE_ENV: 'production' };
const procs = [
  spawn('pnpm', ['--filter', '@stockflow/worker', 'start'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: childEnv }),
  spawn('pnpm', ['--filter', '@stockflow/web', 'start'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: childEnv }),
];

const ip = lanIp();
setTimeout(() => {
  console.log('\n────────────────────────────────────────────');
  console.log('  ✅ StockFlow demo is up');
  console.log(`  Laptop:  http://localhost:3000`);
  console.log(`  Phone:   http://${ip}:3000   (same Wi-Fi; picker PWA)`);
  console.log('  Login:   ops@stockflow.demo / demo1234');
  console.log('  Ctrl+C to stop.');
  console.log('────────────────────────────────────────────\n');
}, 4000);

function shutdown() {
  console.log('\n▸ Stopping…');
  procs.forEach((p) => p.kill());
  spawnSync('docker', [...compose, 'stop'], { stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
