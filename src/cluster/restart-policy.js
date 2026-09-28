'use strict';

// Task 2.1 restart rules, kept free of processes and timers so they can be unit-tested.
//   Rule 1  CPU ≥ thresholdPct for sustainSamples consecutive samples → graceful replacement
//   Rule 2  no sample for heartbeatTimeoutMs (event loop blocked)    → kill + replace
//   Rule 3  samples during the first warmupMs are ignored (boot spike)
//   Rule 4  at most `max` restarts per `windowMs` (circuit breaker)

function createWorkerState(now) {
  return { forkedAt: now, listeningAt: null, lastSampleAt: null, highStreak: 0, retiring: false };
}

// The heartbeat clock starts once the server is up; booting can legitimately take a while.
function markListening(state, now) {
  state.listeningAt = now;
  state.lastSampleAt = now;
}

function onSample(state, pct, now, cpu) {
  state.lastSampleAt = now;
  if (state.retiring) return null;
  if (now - state.forkedAt < cpu.warmupMs) {
    state.highStreak = 0;
    return null;
  }
  state.highStreak = pct >= cpu.thresholdPct ? state.highStreak + 1 : 0;
  if (state.highStreak < cpu.sustainSamples) return null;
  return {
    reason: `cpu ${pct.toFixed(1)}% >= ${cpu.thresholdPct}% for ${state.highStreak} consecutive samples`,
    graceful: true,
  };
}

function checkHeartbeat(state, now, cpu) {
  if (state.retiring || state.listeningAt === null) return null;
  const silentMs = now - state.lastSampleAt;
  if (silentMs <= cpu.heartbeatTimeoutMs) return null;
  return { reason: `no CPU sample for ${silentMs} ms (event loop blocked)`, graceful: false };
}

function createRestartBudget({ max, windowMs }) {
  let restarts = [];
  return {
    tryConsume(now) {
      restarts = restarts.filter((t) => now - t < windowMs);
      if (restarts.length >= max) return false;
      restarts.push(now);
      return true;
    },
  };
}

module.exports = { createWorkerState, markListening, onSample, checkHeartbeat, createRestartBudget };
