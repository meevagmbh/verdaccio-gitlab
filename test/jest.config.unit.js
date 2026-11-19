/* eslint comma-dangle: 0 */

module.exports = {
  verbose: true,
  rootDir: '..',
  collectCoverage: true,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    // Resolve the project's babel-jest: a bare 'babel-jest' resolves to jest's
    // nested copy, which loads jest's own @babel/core 7 instead of the project's.
    '^.+\\.(js|jsx|ts|tsx)$': require.resolve('babel-jest'),
  },
  collectCoverageFrom: ['src/*.ts'],
  testRegex: 'test/unit/.*\\.spec\\.ts',
  coveragePathIgnorePatterns: ['node_modules', 'fixtures'],
};
