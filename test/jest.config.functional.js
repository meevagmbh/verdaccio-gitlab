/* eslint comma-dangle: 0 */

module.exports = {
  verbose: true,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  globalSetup: './functional/pre-setup.js',
  globalTeardown: './functional/teardown.js',
  testEnvironment: './functional/test-environment.js',
  collectCoverage: false,
};
