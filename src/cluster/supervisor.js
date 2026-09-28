'use strict';

const cluster = require('node:cluster');
const { createLogger } = require('../common/logger/logger');
const policy = require('./restart-policy');

const WATCHDOG_INTERVAL_MS = 500;

// Task 2.1 — runs in the cluster PRIMARY, which does no HTTP or database work, so its event loop is
// always free to act. A server whose event loop is pegged can't run its own timers, so a monitor
// inside that process would miss exactly the case it exists for.
//
// Each server worker reports its CPU every second over IPC (CpuSamplerService). On a restart the
// replacement is forked first; the old worker is retired only once the new one is listening, so the
// shared port keeps serving.
function startSupervisor(config) {
  const log = createLogger({ level: config.logLevel, name: 'supervisor' });
  const states = new Map();                        // worker.id → restart-policy state
  const budget = policy.createRestartBudget(config.restart);
  let shuttingDown = false;

  function spawn() {
    const worker = cluster.fork();
    const state = policy.createWorkerState(Date.now());
    states.set(worker.id, state);

    worker.on('message', (message) => {
      if (message?.type !== 'cpu') return;
      log.debug({ workerPid: worker.process.pid, cpuPct: message.pct, eventLoopPct: message.eventLoopPct }, 'cpu sample');
      const decision = policy.onSample(state, message.pct, Date.now(), config.cpu);
      if (decision) replace(worker, decision);
    });
    worker.once('listening', () => {
      policy.markListening(state, Date.now());
      log.info({ workerPid: worker.process.pid }, 'server worker listening');
    });
    return worker;
  }

  function replace(old, { reason, graceful }) {
    const state = states.get(old.id);
    if (!state || state.retiring || shuttingDown) return;
    if (!budget.tryConsume(Date.now())) {
      log.error({ workerPid: old.process.pid, reason }, 'restart budget exhausted, not restarting');
      return;
    }

    state.retiring = true;
    log.warn({ workerPid: old.process.pid, reason }, 'restarting server worker');
    const fresh = spawn();
    states.get(fresh.id).replacementFor = old.id;
    fresh.once('listening', () => {
      states.get(fresh.id).replacementFor = null;
      log.info({ oldPid: old.process.pid, newPid: fresh.process.pid }, 'replacement is serving, retiring old worker');
      if (graceful) retire(old);
      else old.process.kill('SIGKILL');            // a blocked event loop can't drain anyway
    });
  }

  // Graceful stop over IPC (SIGTERM would kill a Windows process without running its handlers),
  // with a hard kill if it takes longer than SHUTDOWN_TIMEOUT_MS.
  function retire(worker) {
    const kill = setTimeout(() => worker.process.kill('SIGKILL'), config.restart.shutdownTimeoutMs);
    worker.once('exit', () => clearTimeout(kill));
    if (worker.isConnected()) worker.send({ type: 'shutdown' });
  }

  const watchdog = setInterval(() => {
    const now = Date.now();
    for (const worker of Object.values(cluster.workers)) {
      const state = states.get(worker.id);
      const decision = state && policy.checkHeartbeat(state, now, config.cpu);
      if (decision) replace(worker, decision);
    }
  }, WATCHDOG_INTERVAL_MS);

  cluster.on('exit', (worker, code, signal) => {
    const state = states.get(worker.id);
    states.delete(worker.id);
    if (shuttingDown) {
      if (states.size === 0) process.exit(0);
      return;
    }
    if (state?.retiring) {
      log.info({ workerPid: worker.process.pid, code, signal }, 'old server worker exited');
      return;
    }
    // A replacement that dies before listening (e.g. the DB is down) leaves the current worker in
    // charge; un-retire it so the CPU rules keep watching it.
    const oldState = state?.replacementFor != null ? states.get(state.replacementFor) : undefined;
    if (oldState) {
      oldState.retiring = false;
      oldState.highStreak = 0;
      log.error({ workerPid: worker.process.pid, code, signal }, 'replacement died before listening, keeping the current worker');
      return;
    }

    log.error({ workerPid: worker.process.pid, code, signal }, 'server worker died unexpectedly');
    if (budget.tryConsume(Date.now())) {
      spawn();
    } else if (states.size === 0) {
      log.fatal('no server workers left and the restart budget is exhausted, exiting');
      process.exit(1);
    }
  });

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(watchdog);
    log.info({ signal }, 'supervisor shutting down');
    if (states.size === 0) process.exit(0);
    for (const worker of Object.values(cluster.workers)) retire(worker);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  log.info(
    {
      workers: config.cluster.workers,
      thresholdPct: config.cpu.thresholdPct,
      sustainSamples: config.cpu.sustainSamples,
      sampleMs: config.cpu.sampleMs,
      heartbeatTimeoutMs: config.cpu.heartbeatTimeoutMs,
    },
    'supervisor started',
  );
  for (let i = 0; i < config.cluster.workers; i += 1) spawn();
}

module.exports = { startSupervisor };
