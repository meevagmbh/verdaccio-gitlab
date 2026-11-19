/* eslint comma-dangle: 0 */

module.exports = {
  verbose: true,
  rootDir: '..',
  collectCoverage: true,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  collectCoverageFrom: ['src/*.ts'],
  testRegex: 'test/unit/.*\\.spec\\.ts',
  coveragePathIgnorePatterns: ['node_modules', 'fixtures'],
};
