import path from 'path';

import globalTunnel from 'global-tunnel-ng';

globalTunnel.initialize();

// verdaccio 6 exports only its package root, so its CLI is reached through
// the package's own bin script. A plain require, not an import: imports are
// hoisted, and the proxy tunnel must be set up before verdaccio loads.
const verdaccioBin = path.join(path.dirname(require.resolve('verdaccio/package.json')), 'bin', 'verdaccio');
// eslint-disable-next-line @typescript-eslint/no-require-imports
require(verdaccioBin);
