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
      branches: 70,
      functions: 70,
      lines: 75,
      statements: 75
    }
  },
  modulePathIgnorePatterns: ['<rootDir>/webapp/', '<rootDir>/approuter/'],
  verbose: true
};
