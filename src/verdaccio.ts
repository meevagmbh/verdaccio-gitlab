import globalTunnel from 'global-tunnel-ng';
globalTunnel.initialize();
// A plain require, not an import: imports are hoisted, and the proxy tunnel
// must be set up before verdaccio loads.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('verdaccio/build/lib/cli');
