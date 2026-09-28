'use strict';

const policy = require('../../src/cluster/restart-policy');

const cpu = { thresholdPct: 70, sustainSamples: 3, heartbeatTimeoutMs: 5000, warmupMs: 10000 };
const T0 = 1_000_000;

describe('onSample (rule 1: sustained CPU)', () => {
  it('ignores samples during warm-up', () => {
    const state = policy.createWorkerState(T0);
    for (let i = 0; i < 5; i += 1) expect(policy.onSample(state, 100, T0 + 1000 * i, cpu)).toBeNull();
  });

  it('restarts gracefully after N consecutive samples at or above the threshold', () => {
    const state = policy.createWorkerState(T0);
    const t = T0 + cpu.warmupMs;
    expect(policy.onSample(state, 95, t, cpu)).toBeNull();
    expect(policy.onSample(state, 70, t + 1000, cpu)).toBeNull();
    const decision = policy.onSample(state, 88.6, t + 2000, cpu);
    expect(decision).toEqual({ reason: 'cpu 88.6% >= 70% for 3 consecutive samples', graceful: true });
  });

  it('resets the streak when a sample drops below the threshold', () => {
    const state = policy.createWorkerState(T0);
    const t = T0 + cpu.warmupMs;
    policy.onSample(state, 99, t, cpu);
    policy.onSample(state, 99, t + 1000, cpu);
    expect(policy.onSample(state, 30, t + 2000, cpu)).toBeNull();
    expect(policy.onSample(state, 99, t + 3000, cpu)).toBeNull();
    expect(state.highStreak).toBe(1);
  });

  it('never decides twice for a retiring worker', () => {
    const state = policy.createWorkerState(T0);
    state.retiring = true;
    for (let i = 0; i < 5; i += 1) expect(policy.onSample(state, 100, T0 + cpu.warmupMs + 1000 * i, cpu)).toBeNull();
  });
});

describe('checkHeartbeat (rule 2: blocked event loop)', () => {
  it('does not start before the worker is listening', () => {
    const state = policy.createWorkerState(T0);
    expect(policy.checkHeartbeat(state, T0 + 60_000, cpu)).toBeNull();
  });

  it('kills and replaces a worker that stopped reporting', () => {
    const state = policy.createWorkerState(T0);
    policy.markListening(state, T0 + 2000);
    policy.onSample(state, 5, T0 + 3000, cpu);
    expect(policy.checkHeartbeat(state, T0 + 3000 + cpu.heartbeatTimeoutMs, cpu)).toBeNull();
    expect(policy.checkHeartbeat(state, T0 + 3001 + cpu.heartbeatTimeoutMs, cpu)).toEqual({
      reason: 'no CPU sample for 5001 ms (event loop blocked)',
      graceful: false,
    });
  });
});

describe('createRestartBudget (rule 4: circuit breaker)', () => {
  it('allows at most `max` restarts per window', () => {
    const budget = policy.createRestartBudget({ max: 2, windowMs: 60_000 });
    expect(budget.tryConsume(T0)).toBe(true);
    expect(budget.tryConsume(T0 + 1000)).toBe(true);
    expect(budget.tryConsume(T0 + 2000)).toBe(false);
    expect(budget.tryConsume(T0 + 60_001)).toBe(true);   // the first restart left the window
  });
});
