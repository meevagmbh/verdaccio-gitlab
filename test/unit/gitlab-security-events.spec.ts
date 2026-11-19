import * as GitbeakerRest from '@gitbeaker/rest';
import { RemoteUser } from '@verdaccio/types';

import VerdaccioGitlab, { VerdaccioGitlabPackageAccess } from '../../src/gitlab';

import logger from './partials/logger';
import config from './partials/config';

// verdaccio ships with log level info, so security events must be logged at
// info or above to show up at all.

const calls = (GitbeakerRest as any).__calls;

function settled(invoke: (cb: (err: any, data?: any) => void) => void): Promise<void> {
  return new Promise(resolve => invoke(() => resolve()));
}

const scopedPackage: VerdaccioGitlabPackageAccess = {
  name: '@foreignGroup/foreignPackage',
  access: ['$authenticated'],
  gitlab: true,
};

describe('Gitlab Auth Plugin security events', () => {
  let plugin: VerdaccioGitlab;

  beforeEach(() => {
    plugin = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);
    jest.clearAllMocks();
  });

  test('a token of another gitlab user is logged as a warning with both names', async () => {
    await settled(cb => plugin.authenticate(config.user, calls.OTHER_TOKEN, cb));

    expect(logger.warn).toHaveBeenCalledWith(
      { user: config.user, gitlabUser: 'otherUser' },
      expect.stringContaining('belongs to gitlab user')
    );
  });

  test('a token gitlab rejects is logged as a warning', async () => {
    await settled(cb => plugin.authenticate(config.user, 'wrong', cb));

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ user: config.user }), expect.any(String));
  });

  test('a denied publish is logged as a warning', async () => {
    const user: RemoteUser = { real_groups: ['myGroup'], groups: ['myGroup'], name: config.user };
    await settled(cb => plugin.allow_publish(user, scopedPackage, cb));

    expect(logger.warn).toHaveBeenCalledWith(
      { user: config.user, pkg: scopedPackage.name },
      expect.stringContaining('denied from publishing')
    );
  });

  test('a denied anonymous access is logged at info', async () => {
    const anonymous: RemoteUser = { real_groups: [], groups: [], name: undefined };
    await settled(cb => plugin.allow_access(anonymous, scopedPackage, cb));

    expect(logger.info).toHaveBeenCalledWith({ pkg: scopedPackage.name }, expect.stringContaining('deny anonymous access'));
  });
});
