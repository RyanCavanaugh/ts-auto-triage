module.exports = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/cli/**/*.ts', // CLI entry points don't need coverage
  ],
  coverageReporters: ['text', 'lcov'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
};