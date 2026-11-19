import { IServerBridge } from '../types';
import Server from '../lib/server';

import { inject } from 'vitest';

import basic from './basic';
import auth from './auth';
import access from './access';
import publish from './publish';

describe('Functional Tests verdaccio-gitlab', () => {
  // global-setup.ts starts the servers in another context and cannot hand
  // them over, so each suite builds its own bridge to the registry url it
  // provides. A bridge keeps the credentials of its last login; with one
  // bridge per suite, a suite that logs in with wrong credentials cannot
  // change what the next suite sends. The GitLab mock is not used by any
  // suite.
  const bridge = (): IServerBridge => new Server(inject('registryUrl'));
  const gitlab = undefined;

  // The suites do not depend on each other's order; the functional vitest
  // config runs them, and the tests in them, in random order.
  basic(bridge(), gitlab);
  auth(bridge(), gitlab);
  access(bridge(), gitlab);
  publish(bridge(), gitlab);
});

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection', err);
  process.nextTick(() => {
    throw err;
  });
});
