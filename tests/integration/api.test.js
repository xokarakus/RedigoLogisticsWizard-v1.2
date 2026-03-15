/**
 * Integration Tests — Express app endpoints
 * Mocks: database, migrations, sapClient, pgQueue, jobScheduler
 */
process.env.NODE_ENV = 'test';

const request = require('supertest');

// Mock heavy dependencies before requiring app
jest.mock('../../src/shared/database/pool', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  pool: { on: jest.fn(), end: jest.fn() }
}));

jest.mock('../../src/shared/database/migrate', () => ({
  runPending: jest.fn().mockResolvedValue({ applied: 0, total: 0 })
}));

jest.mock('../../src/shared/sap/client', () => ({
  initialize: jest.fn().mockResolvedValue(),
  isConnected: jest.fn().mockReturnValue(false)
}));

jest.mock('../../src/shared/queue/pgQueue', () => ({
  startWorker: jest.fn(),
  stopWorker: jest.fn(),
  getStats: jest.fn().mockResolvedValue({ pending: 0, processing: 0, dead: 0 }),
  getJobs: jest.fn().mockResolvedValue([])
}));

jest.mock('../../src/shared/services/jobScheduler', () => ({
  loadActiveJobs: jest.fn(),
  stopAll: jest.fn()
}));

jest.mock('../../src/modules/work-order/services/WorkOrderQueueHandler', () => ({}));

jest.mock('../../src/shared/database/dbStore', () => {
  return jest.fn().mockImplementation(() => ({
    readAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({})
  }));
});

// Suppress Sentry
jest.mock('../../src/shared/sentry', () => ({
  initSentry: jest.fn(),
  sentryErrorHandler: () => (err, req, res, next) => next(err),
  captureException: jest.fn()
}));

// Suppress swagger
jest.mock('../../src/shared/swagger', () => ({
  setupSwagger: jest.fn()
}));

let app;

beforeAll(async () => {
  // Require app after mocks are set
  app = require('../../src/index');
  // Give startup a moment
  await new Promise(r => setTimeout(r, 100));
});

describe('Health & System Endpoints', () => {
  test('GET /health returns 200 with status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('version', '1.2.0');
    expect(res.body).toHaveProperty('uptime');
  });

  test('GET /metrics returns prometheus text', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  test('GET /health/circuit-breakers returns 200', async () => {
    const res = await request(app).get('/health/circuit-breakers');
    expect(res.status).toBe(200);
  });
});

describe('Auth Endpoints', () => {
  test('GET /api/v1/auth/setup-status returns JSON', async () => {
    const res = await request(app).get('/api/v1/auth/setup-status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('needs_setup');
  });

  test('POST /api/v1/auth/login without body returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/v1/auth/login with invalid email returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'notanemail', password: 'test' });
    expect(res.status).toBe(400);
  });

  test('POST /api/v1/auth/login with valid email returns 401 (user not found)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'Test1234' });
    expect(res.status).toBe(401);
  });
});

describe('Protected Routes (no auth)', () => {
  test('GET /api/v1/work-orders returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/work-orders');
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/dashboard/summary returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/dashboard/summary');
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/reports/cycle-times returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/reports/cycle-times');
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/config/warehouses returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/config/warehouses');
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/transactions returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/transactions');
    expect(res.status).toBe(401);
  });
});

describe('API Versioning', () => {
  test('GET /api/v1/auth/setup-status works with v1 prefix', async () => {
    const res = await request(app).get('/api/v1/auth/setup-status');
    expect(res.status).toBe(200);
  });

  test('GET /api/auth/setup-status works with backward compat prefix', async () => {
    const res = await request(app).get('/api/auth/setup-status');
    expect(res.status).toBe(200);
    expect(res.headers['x-api-deprecated']).toBeDefined();
  });
});

describe('Error Handling', () => {
  test('GET /nonexistent returns 404', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Not found');
  });

  test('POST with invalid JSON returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"invalid json');
    expect(res.status).toBe(400);
  });
});

describe('CORS & Security Headers', () => {
  test('Response includes security headers from helmet', async () => {
    const res = await request(app).get('/health');
    // helmet adds various headers
    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
    expect(res.headers).toHaveProperty('x-frame-options');
  });

  test('Response includes correlation ID', async () => {
    const res = await request(app).get('/health');
    expect(res.headers).toHaveProperty('x-correlation-id');
  });

  test('Custom correlation ID is echoed back', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Correlation-Id', 'test-corr-123');
    expect(res.headers['x-correlation-id']).toBe('test-corr-123');
  });
});
