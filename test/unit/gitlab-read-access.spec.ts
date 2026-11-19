import * as GitbeakerRest from '@gitbeaker/rest';
import { RemoteUser } from '@verdaccio/types';

import VerdaccioGitlab, { READ_ONLY_PREFIX, VerdaccioGitlabPackageAccess } from '../../src/gitlab';

import config from './partials/config';

// Reading a package in a gitlab section needs the configured GitLab role
// (auth.gitlab.access, default $reporter) on the group or project the package
// name maps to, the same mapping publish uses. Sections whose access includes
// $all or $anonymous stay public.

const calls = (GitbeakerRest as any).__calls;

function authenticate(plugin: VerdaccioGitlab, pass: string = config.pass): Promise<any> {
  return new Promise((resolve) => plugin.authenticate(config.user, pass, (err: any, groups: any) => resolve(err || groups)));
}

function check(invoke: (cb: (err: any, ok?: boolean) => void) => void): Promise<{ err: any; ok?: boolean }> {
  return new Promise((resolve) => invoke((err, ok) => resolve({ err, ok })));
}

function remoteUser(groups: string[]): RemoteUser {
  return { name: config.user, real_groups: groups, groups };
}

function privatePackage(name: string): VerdaccioGitlabPackageAccess {
  return { name, access: ['$authenticated'], publish: ['$authenticated'], gitlab: true };
}

describe('Gitlab Auth Plugin read access', () => {
  let plugin: VerdaccioGitlab;

  beforeEach(() => {
    plugin = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);
    vi.clearAllMocks();
  });

  describe('groups from a login', () => {
    test('lists publish groups plainly and read-only groups with a prefix', async () => {
      const groups = await authenticate(plugin);

      expect(groups.sort()).toEqual(
        ['myUser', 'myGroup', 'anotherGroup/myProject', `${READ_ONLY_PREFIX}readGroup`, `${READ_ONLY_PREFIX}readGroup/readProject`].sort()
      );
    });

    test('queries both roles in parallel with lean responses', async () => {
      await authenticate(plugin);

      expect(calls.groupsAll).toHaveBeenCalledTimes(2);
      expect(calls.projectsAll).toHaveBeenCalledTimes(2);
      expect(calls.groupsAll).toHaveBeenCalledWith({ minAccessLevel: 20, perPage: 100, topLevelOnly: true });
      expect(calls.groupsAll).toHaveBeenCalledWith({ minAccessLevel: 40, perPage: 100, topLevelOnly: true });
      expect(calls.projectsAll).toHaveBeenCalledWith({ minAccessLevel: 20, perPage: 100, simple: true });
      expect(calls.projectsAll).toHaveBeenCalledWith({ minAccessLevel: 40, perPage: 100, simple: true });
    });

    test('queries once when access and publish need the same role', async () => {
      plugin = new VerdaccioGitlab({ ...config.verdaccioGitlabConfig, access: '$maintainer' }, config.options);

      const groups = await authenticate(plugin);

      expect(calls.groupsAll).toHaveBeenCalledTimes(1);
      expect(calls.projectsAll).toHaveBeenCalledTimes(1);
      expect(groups.some((group: string) => group.startsWith(READ_ONLY_PREFIX))).toBe(false);
    });

    test('rejects an unknown access level', () => {
      expect(() => new VerdaccioGitlab({ ...config.verdaccioGitlabConfig, access: '$nobody' as any }, config.options)).toThrow(/access level/);
    });
  });

  describe('allow_access', () => {
    const groups = ['myUser', 'myGroup', 'anotherGroup/myProject', `${READ_ONLY_PREFIX}readGroup`];

    test.each([
      ['a package of a group with publish role', '@myGroup/pkg'],
      ['a package of a group with read role', '@readGroup/pkg'],
      ['a package named like a project', '@anotherGroup/myProject'],
      ['a package named like the user', 'myUser'],
      ['a package named like a group', 'myGroup'],
    ])('allows %s', async (_name, pkg) => {
      const { err, ok } = await check((cb) => plugin.allow_access(remoteUser(groups), privatePackage(pkg), cb));

      expect(err).toBeFalsy();
      expect(ok).toBe(true);
    });

    test.each([
      ['a package of a foreign group', '@foreignGroup/pkg'],
      ['an unscoped package without a matching group', 'lodash'],
      ['a package named like the prefix itself', `${READ_ONLY_PREFIX}readGroup`],
    ])('denies %s with 403', async (_name, pkg) => {
      const { err } = await check((cb) => plugin.allow_access(remoteUser(groups), privatePackage(pkg), cb));

      expect(err.status).toBe(403);
    });

    test.each([['$all'], ['$anonymous']])('allows anyone into a section with %s access', async (level) => {
      const pkg = { ...privatePackage('@foreignGroup/pkg'), access: [level] };

      const member = await check((cb) => plugin.allow_access(remoteUser(groups), pkg, cb));
      const anonymous = await check((cb) => plugin.allow_access({ name: undefined, real_groups: [], groups: [] }, pkg, cb));

      expect(member.ok).toBe(true);
      expect(anonymous.ok).toBe(true);
    });

    // verdaccio reads a section without access as "nobody"; it must not
    // turn into public here.
    test('a section without access is not public', async () => {
      const pkg = { ...privatePackage('@foreignGroup/pkg'), access: [] };

      const member = await check((cb) => plugin.allow_access(remoteUser(groups), pkg, cb));
      const anonymous = await check((cb) => plugin.allow_access({ name: undefined, real_groups: [], groups: [] }, pkg, cb));

      expect(member.err.status).toBe(403);
      expect(anonymous.err.status).toBe(401);
    });
  });

  describe('allow_publish', () => {
    test('a read role does not allow publishing', async () => {
      const groups = ['myUser', `${READ_ONLY_PREFIX}readGroup`];

      const { err } = await check((cb) => plugin.allow_publish(remoteUser(groups), privatePackage('@readGroup/pkg'), cb));

      expect(err.status).toBe(403);
    });
  });
});
