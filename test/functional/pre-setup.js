// @babel/register 8 is ESM; require() returns its namespace.
require('@babel/register').default({
  extensions: ['.ts', '.js']
});

import { blue } from 'kleur';

module.exports = async () => {
  console.log(blue('setup: starting servers'));
  require('./lib/setup');
}