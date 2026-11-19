import { RemoteUser } from '@verdaccio/types';

import VerdaccioGitlab, { VerdaccioGitlabPackageAccess } from '../../src/gitlab';

import config from './partials/config';

// verdaccio turns the error a plugin hands back into the HTTP response, so the
// status code is part of the plugin's contract, not an implementation detail.

function callbackError(invoke: (cb: (err: any) => void) => void): Promise<any> {
  return new Promise(resolve => invoke(err => resolve(err)));
}

const scopedPackage: VerdaccioGitlabPackageAccess = {
  name: '@foreignGroup/foreignPackage',
  access: ['$authenticated'],
  publish: ['$authenticated'],
  gitlab: true,
};

describe('Gitlab Auth Plugin error responses', () => {
  let plugin: VerdaccioGitlab;

  beforeEach(() => {
    plugin = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);
  });

  test('a wrong password is answered with 401', async () => {
    const err = await callbackError(cb => plugin.authenticate(config.user, config.pass + '_wrong', cb));

    expect(err.status).toBe(401);
  });

  test('anonymous access to a non-public package is answered with 401', async () => {
    const anonymous: RemoteUser = { real_groups: [], groups: [], name: undefined };
    const err = await callbackError(cb => plugin.allow_access(anonymous, scopedPackage, cb));

    expect(err.status).toBe(401);
  });

  test('publishing outside the user groups is answered with 403', async () => {
    const user: RemoteUser = { real_groups: ['myGroup'], groups: ['myGroup'], name: config.user };
    const err = await callbackError(cb => plugin.allow_publish(user, scopedPackage, cb));

    expect(err.status).toBe(403);
    expect(err.message).toContain('package-scope');
  });

  test('changing the password through verdaccio is answered with 500', async () => {
    const err = await callbackError(cb => plugin.changePassword(config.user, config.pass, 'new', cb));

    expect(err.status).toBe(500);
  });
});
