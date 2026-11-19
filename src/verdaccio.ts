import path from 'path';

// verdaccio 6 exports only its package root, so its CLI is reached through
// the package's own bin script.
//
// Proxies need no setup here: verdaccio reads http_proxy/https_proxy/no_proxy
// for its uplinks itself, and Node routes fetch (the GitLab client) and
// http/https through them when started with NODE_USE_ENV_PROXY=1.
const verdaccioBin = path.join(path.dirname(require.resolve('verdaccio/package.json')), 'bin', 'verdaccio');
// eslint-disable-next-line @typescript-eslint/no-require-imports
require(verdaccioBin);
