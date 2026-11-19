// @babel/register 8 is ESM; require() returns its namespace.
require('@babel/register').default({
  extensions: ['.ts', '.js'],
});
module.exports = require('./lib/environment');
