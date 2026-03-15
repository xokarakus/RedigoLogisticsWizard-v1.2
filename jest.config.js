module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/test-services.js',
    '!src/shared/database/migrations/**',
    '!src/shared/database/seed.js',
    '!src/shared/swagger.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  modulePathIgnorePatterns: ['<rootDir>/webapp/', '<rootDir>/approuter/'],
  verbose: true
};
