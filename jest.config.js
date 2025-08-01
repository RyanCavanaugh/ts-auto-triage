export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: [
    '**/dist/**/*.test.js'
  ],
  moduleFileExtensions: ['js', 'json'],
  collectCoverageFrom: [
    'packages/*/dist/**/*.js',
    '!**/*.test.js',
    '!**/*.d.ts'
  ]
};