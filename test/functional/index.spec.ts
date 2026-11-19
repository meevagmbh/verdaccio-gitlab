import { IServerBridge } from '../types';
import Server from '../lib/server';

import { inject } from 'vitest';

import basic from './basic';
import auth from './auth';
import access from './access';
import publish from './publish';

describe('Functional Tests verdaccio-gitlab', () => {
  // global-setup.ts starts the servers in another context and cannot hand
  // them over, so the suite builds its own bridge to the registry url it
  // provides. The GitLab mock is not used by any suite.
  const server1: IServerBridge = new Server(inject('registryUrl'));
  const gitlab = undefined;

  // list of tests
  // note: order of the following calls is important
  basic(server1, gitlab);
  auth(server1, gitlab);
  access(server1, gitlab);
  publish(server1, gitlab);
});

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection', err);
  process.nextTick(() => {
    throw err;
  });
});
