/**
 * Circuit Breaker Unit Tests
 */
jest.mock('../../src/shared/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const { CircuitBreaker, STATE } = require('../../src/shared/utils/circuitBreaker');

describe('CircuitBreaker', () => {
  let cb;

  beforeEach(() => {
    cb = new CircuitBreaker('test', {
      failureThreshold: 3,
      cooldownMs: 100,
      timeoutMs: 500
    });
  });

  it('should start in CLOSED state', () => {
    expect(cb.state).toBe(STATE.CLOSED);
  });

  it('should execute function successfully in CLOSED state', async () => {
    const result = await cb.exec(async () => 'success');
    expect(result).toBe('success');
    expect(cb.successCount).toBe(1);
    expect(cb.failureCount).toBe(0);
  });

  it('should count failures', async () => {
    try { await cb.exec(async () => { throw new Error('fail'); }); } catch (_) {}
    expect(cb.failureCount).toBe(1);
    expect(cb.state).toBe(STATE.CLOSED);
  });

  it('should open after reaching failure threshold', async () => {
    for (let i = 0; i < 3; i++) {
      try { await cb.exec(async () => { throw new Error('fail'); }); } catch (_) {}
    }
    expect(cb.state).toBe(STATE.OPEN);
    expect(cb.failureCount).toBe(3);
  });

  it('should reject calls when OPEN', async () => {
    // Force OPEN
    for (let i = 0; i < 3; i++) {
      try { await cb.exec(async () => { throw new Error('fail'); }); } catch (_) {}
    }

    await expect(cb.exec(async () => 'should not run'))
      .rejects.toThrow('Circuit breaker OPEN');
  });

  it('should transition to HALF_OPEN after cooldown', async () => {
    // Force OPEN
    for (let i = 0; i < 3; i++) {
      try { await cb.exec(async () => { throw new Error('fail'); }); } catch (_) {}
    }

    // Wait for cooldown
    await new Promise(r => setTimeout(r, 150));

    // Should be HALF_OPEN now and allow one probe
    const result = await cb.exec(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(cb.state).toBe(STATE.CLOSED);
  });

  it('should go back to OPEN if HALF_OPEN probe fails', async () => {
    for (let i = 0; i < 3; i++) {
      try { await cb.exec(async () => { throw new Error('fail'); }); } catch (_) {}
    }

    await new Promise(r => setTimeout(r, 150));

    try { await cb.exec(async () => { throw new Error('probe fail'); }); } catch (_) {}
    expect(cb.state).toBe(STATE.OPEN);
  });

  it('should reset failure count on success', async () => {
    try { await cb.exec(async () => { throw new Error('fail'); }); } catch (_) {}
    try { await cb.exec(async () => { throw new Error('fail'); }); } catch (_) {}
    expect(cb.failureCount).toBe(2);

    await cb.exec(async () => 'success');
    expect(cb.failureCount).toBe(0);
  });

  it('should timeout long-running functions', async () => {
    const slowCb = new CircuitBreaker('slow-test', { timeoutMs: 50, failureThreshold: 10 });

    await expect(slowCb.exec(async () => {
      await new Promise(r => setTimeout(r, 200));
    })).rejects.toThrow('timeout');
  });

  it('should return correct status', () => {
    const status = cb.getStatus();
    expect(status.name).toBe('test');
    expect(status.state).toBe('CLOSED');
    expect(status.failureThreshold).toBe(3);
    expect(status.stats.totalCalls).toBe(0);
    expect(status.stats.errorRate).toBe('0%');
  });

  it('should support manual reset', async () => {
    for (let i = 0; i < 3; i++) {
      try { await cb.exec(async () => { throw new Error('fail'); }); } catch (_) {}
    }
    expect(cb.state).toBe(STATE.OPEN);

    cb.reset();
    expect(cb.state).toBe(STATE.CLOSED);
    expect(cb.failureCount).toBe(0);
  });

  it('should track error rate', async () => {
    await cb.exec(async () => 'ok');
    try { await cb.exec(async () => { throw new Error('fail'); }); } catch (_) {}

    const status = cb.getStatus();
    expect(status.stats.totalCalls).toBe(2);
    expect(status.stats.totalFailures).toBe(1);
    expect(status.stats.errorRate).toBe('50.0%');
  });
});
