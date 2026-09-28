'use strict';

// Task 2.1 demo: starts the server in cluster mode with the debug routes on, burns CPU inside the
// server worker, and watches the supervisor replace it (the /health pid changes).
//
//   pnpm build && pnpm demo:cpu        (needs MONGO_URI, e.g. from .env)
//
// Two scenarios:
//   yield — ~100 % CPU while the event loop stays responsive → "CPU >= 70 % for 3 samples" rule
//   block — one synchronous loop freezes the event loop       → "no CPU sample" heartbeat rule

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.DEMO_PORT ?? 3199);
const BASE = `http://127.0.0.1:${PORT}`;
const entry = fs.existsSync(path.join(ROOT, 'dist', 'main.js'))
  ? ['dist/main.js']
  : ['--require', '@babel/register', 'src/main.js'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function health() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1000) });
    return (await res.json()).data;
  } catch {
    return null;
  }
}

async function waitForHealth(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const h = await health();
    if (h && predicate(h)) return h;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function scenario(mode) {
  const before = await waitForHealth((h) => h.uptimeSec >= 3, 90_000, 'a warmed-up server');
  console.log(`\n▶ ${mode}: server worker pid ${before.pid}; starting a 30 s "${mode}" CPU burn`);
  await fetch(`${BASE}/api/debug/cpu-burn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seconds: 30, mode }),
  });

  const startedAt = Date.now();
  let ok = 0;
  let failed = 0;
  while (Date.now() - startedAt < 40_000) {
    const h = await health();
    if (!h) failed += 1;
    else if (h.pid === before.pid) {
      ok += 1;
      if (h.cpu) process.stdout.write(`  pid ${h.pid}  cpu ${String(h.cpu.pct).padStart(5)} %  event loop ${String(h.cpu.eventLoopPct).padStart(5)} %\n`);
    } else {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`✓ ${mode}: replaced pid ${before.pid} → ${h.pid} after ${seconds} s (health checks: ${ok} ok, ${failed} failed)`);
      return true;
    }
    await sleep(500);
  }
  console.log(`✗ ${mode}: pid ${before.pid} was not replaced within 40 s`);
  return false;
}

async function main() {
  const server = spawn(process.execPath, entry, {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      PORT: String(PORT),
      CLUSTER_ENABLED: 'true',
      WEB_CONCURRENCY: '1',
      ENABLE_DEBUG_ROUTES: 'true',
      CPU_WARMUP_MS: '2000',
      SCHEDULER_ENABLED: 'false',
      LOG_LEVEL: process.env.DEMO_LOG_LEVEL ?? 'warn',   // supervisor restarts are logged at warn
    },
  });

  let passed = false;
  try {
    passed = (await scenario('yield')) && (await scenario('block'));
  } finally {
    server.kill();                // workers shut down when their supervisor disappears
    await sleep(1000);
  }
  console.log(passed ? '\nDemo passed: both scenarios triggered a restart.' : '\nDemo failed.');
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
