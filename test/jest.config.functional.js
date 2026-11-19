/* eslint comma-dangle: 0 */

module.exports = {
  verbose: true,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  globalSetup: './functional/pre-setup.js',
  globalTeardown: './functional/teardown.js',
  testEnvironment: './functional/test-environment.js',
  transform: {
    // Resolve the project's babel-jest: a bare 'babel-jest' resolves to jest's
    // nested copy, which loads jest's own @babel/core 7 instead of the project's.
    '^.+\\.(js|jsx|ts|tsx)$': require.resolve('babel-jest'),
  },
  collectCoverage: false,
};
