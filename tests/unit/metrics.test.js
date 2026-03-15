/**
 * Metrics Unit Tests
 */
const { incCounter, setGauge, observeHistogram, serialize } = require('../../src/shared/utils/metrics');

describe('Metrics', () => {
  describe('incCounter', () => {
    it('should increment counter', () => {
      incCounter('test_requests_total', { method: 'GET' });
      incCounter('test_requests_total', { method: 'GET' });
      const output = serialize();
      expect(output).toContain('test_requests_total{method="GET"} 2');
    });

    it('should track different labels separately', () => {
      incCounter('test_by_status', { status: '200' });
      incCounter('test_by_status', { status: '500' });
      const output = serialize();
      expect(output).toContain('test_by_status{status="200"}');
      expect(output).toContain('test_by_status{status="500"}');
    });
  });

  describe('setGauge', () => {
    it('should set gauge value', () => {
      setGauge('test_active_connections', {}, 42);
      const output = serialize();
      expect(output).toContain('test_active_connections 42');
    });
  });

  describe('observeHistogram', () => {
    it('should record histogram observations', () => {
      observeHistogram('test_duration_ms', { route: '/api' }, 150);
      observeHistogram('test_duration_ms', { route: '/api' }, 250);
      const output = serialize();
      expect(output).toContain('test_duration_ms_count');
      expect(output).toContain('test_duration_ms_sum');
      expect(output).toContain('test_duration_ms_bucket');
    });
  });

  describe('serialize', () => {
    it('should include process metrics', () => {
      const output = serialize();
      expect(output).toContain('process_resident_memory_bytes');
      expect(output).toContain('process_heap_used_bytes');
      expect(output).toContain('process_uptime_seconds');
    });

    it('should output Prometheus text format', () => {
      const output = serialize();
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });
  });
});
