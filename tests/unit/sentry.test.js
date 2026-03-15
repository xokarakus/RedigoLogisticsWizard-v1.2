/**
 * Unit tests for src/shared/sentry.js
 */

// ---- Mocks ----
const mockSentryInit = jest.fn();
const mockSetupExpressErrorHandler = jest.fn().mockReturnValue('sentryHandler');
const mockWithScope = jest.fn((cb) => cb(mockScope));
const mockCaptureException = jest.fn();
const mockHttpIntegration = jest.fn().mockReturnValue('httpInteg');
const mockExpressIntegration = jest.fn().mockReturnValue('expressInteg');

const mockScope = {
  setUser: jest.fn(),
  setTag: jest.fn(),
  setExtras: jest.fn()
};

jest.mock('@sentry/node', () => ({
  init: mockSentryInit,
  setupExpressErrorHandler: mockSetupExpressErrorHandler,
  withScope: mockWithScope,
  captureException: mockCaptureException,
  httpIntegration: mockHttpIntegration,
  expressIntegration: mockExpressIntegration
}));

const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
jest.mock('../../src/shared/utils/logger', () => mockLogger);

// ---- Helpers ----
const mockReq = (overrides = {}) => ({ headers: {}, ...overrides });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// We need to re-require the module for each describe block to control the
// `initialized` flag, which is module-level state.

describe('sentry module', () => {
  // =============================================================================
  // initSentry — no DSN
  // =============================================================================
  describe('initSentry without SENTRY_DSN', () => {
    let sentry;

    beforeAll(() => {
      delete process.env.SENTRY_DSN;
      // Fresh require with no DSN
      jest.resetModules();
      jest.clearAllMocks();
      // Re-apply mocks after resetModules
      jest.mock('@sentry/node', () => ({
        init: mockSentryInit,
        setupExpressErrorHandler: mockSetupExpressErrorHandler,
        withScope: mockWithScope,
        captureException: mockCaptureException,
        httpIntegration: mockHttpIntegration,
        expressIntegration: mockExpressIntegration
      }));
      jest.mock('../../src/shared/utils/logger', () => mockLogger);
      sentry = require('../../src/shared/sentry');
    });

    it('logs "Sentry disabled" and does not call Sentry.init', () => {
      const app = {};
      sentry.initSentry(app);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sentry disabled')
      );
      expect(mockSentryInit).not.toHaveBeenCalled();
    });

    it('sentryErrorHandler returns passthrough middleware', () => {
      const handler = sentry.sentryErrorHandler();
      expect(typeof handler).toBe('function');
      expect(handler.length).toBe(4); // err, req, res, next

      const next = jest.fn();
      const err = new Error('test');
      handler(err, mockReq(), mockRes(), next);
      expect(next).toHaveBeenCalledWith(err);
      expect(mockSetupExpressErrorHandler).not.toHaveBeenCalled();
    });

    it('captureException does nothing', () => {
      sentry.captureException(new Error('ignored'));
      expect(mockWithScope).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // initSentry — with DSN
  // =============================================================================
  describe('initSentry with SENTRY_DSN', () => {
    let sentry;

    beforeAll(() => {
      process.env.SENTRY_DSN = 'https://key@sentry.io/123';
      jest.resetModules();
      jest.clearAllMocks();
      jest.mock('@sentry/node', () => ({
        init: mockSentryInit,
        setupExpressErrorHandler: mockSetupExpressErrorHandler,
        withScope: mockWithScope,
        captureException: mockCaptureException,
        httpIntegration: mockHttpIntegration,
        expressIntegration: mockExpressIntegration
      }));
      jest.mock('../../src/shared/utils/logger', () => mockLogger);
      sentry = require('../../src/shared/sentry');
    });

    afterAll(() => {
      delete process.env.SENTRY_DSN;
    });

    it('calls Sentry.init with proper config', () => {
      const app = { use: jest.fn() };
      sentry.initSentry(app);

      expect(mockSentryInit).toHaveBeenCalledTimes(1);
      const config = mockSentryInit.mock.calls[0][0];
      expect(config.dsn).toBe('https://key@sentry.io/123');
      expect(config.release).toBe('redigo-logistics@1.2.0');
      expect(typeof config.beforeSend).toBe('function');
      expect(config.ignoreErrors).toEqual(expect.arrayContaining(['ECONNREFUSED']));
    });

    it('beforeSend strips authorization and cookie headers', () => {
      const config = mockSentryInit.mock.calls[0][0];
      const event = {
        request: {
          headers: {
            authorization: 'Bearer secret',
            cookie: 'session=abc',
            'content-type': 'application/json'
          }
        }
      };

      const sanitized = config.beforeSend(event);

      expect(sanitized.request.headers.authorization).toBeUndefined();
      expect(sanitized.request.headers.cookie).toBeUndefined();
      expect(sanitized.request.headers['content-type']).toBe('application/json');
    });

    it('beforeSend handles event without request headers gracefully', () => {
      const config = mockSentryInit.mock.calls[0][0];
      const event = { message: 'no request' };
      const result = config.beforeSend(event);
      expect(result).toEqual(event);
    });

    it('logs "Sentry error tracking enabled"', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sentry error tracking enabled')
      );
    });

    // -- sentryErrorHandler (initialized) --
    it('sentryErrorHandler calls Sentry.setupExpressErrorHandler when initialized', () => {
      const result = sentry.sentryErrorHandler();
      expect(mockSetupExpressErrorHandler).toHaveBeenCalled();
      expect(result).toBe('sentryHandler');
    });

    // -- captureException (initialized) --
    describe('captureException', () => {
      beforeEach(() => {
        jest.clearAllMocks();
        mockWithScope.mockImplementation((cb) => cb(mockScope));
      });

      it('calls Sentry.withScope and Sentry.captureException', () => {
        const err = new Error('kaboom');
        sentry.captureException(err);

        expect(mockWithScope).toHaveBeenCalledTimes(1);
        expect(mockCaptureException).toHaveBeenCalledWith(err);
      });

      it('sets user on scope when context.user provided', () => {
        const err = new Error('fail');
        sentry.captureException(err, { user: { id: 'u1' } });
        expect(mockScope.setUser).toHaveBeenCalledWith({ id: 'u1' });
      });

      it('sets tenant_id tag when context.tenantId provided', () => {
        sentry.captureException(new Error('x'), { tenantId: 't5' });
        expect(mockScope.setTag).toHaveBeenCalledWith('tenant_id', 't5');
      });

      it('sets correlation_id tag when context.correlationId provided', () => {
        sentry.captureException(new Error('x'), { correlationId: 'c-99' });
        expect(mockScope.setTag).toHaveBeenCalledWith('correlation_id', 'c-99');
      });

      it('sets extras when context.extra provided', () => {
        sentry.captureException(new Error('x'), { extra: { key: 'val' } });
        expect(mockScope.setExtras).toHaveBeenCalledWith({ key: 'val' });
      });

      it('works with empty context', () => {
        sentry.captureException(new Error('bare'));
        expect(mockScope.setUser).not.toHaveBeenCalled();
        expect(mockScope.setTag).not.toHaveBeenCalled();
        expect(mockScope.setExtras).not.toHaveBeenCalled();
        expect(mockCaptureException).toHaveBeenCalled();
      });
    });
  });
});
