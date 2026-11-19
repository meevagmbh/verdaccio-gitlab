import * as GitbeakerRest from '@gitbeaker/rest';

import VerdaccioGitlab from '../../src/gitlab';

import config from './partials/config';

const calls = (GitbeakerRest as any).__calls;

function authenticate(plugin: VerdaccioGitlab, user: string, pass: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    plugin.authenticate(user, pass, (err: any, data: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

describe('Gitlab Auth Plugin concurrency', () => {
  beforeEach(() => {
    calls.usersCurrent.mockClear();
    calls.groupsAll.mockClear();
    calls.projectsAll.mockClear();
  });

  test('concurrent logins with the same credentials share a single gitlab walk', () => {
    const plugin: VerdaccioGitlab = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);

    // Fire them before any of them can resolve, which is exactly what a burst
    // of npm requests does. The auth cache cannot help here: it is only
    // written once the walk finishes.
    const logins = [1, 2, 3, 4, 5].map(() => authenticate(plugin, config.user, config.pass));

    return Promise.all(logins).then(results => {
      results.forEach(groups => {
        expect(groups.sort()).toEqual(['myGroup', 'anotherGroup/myProject', 'myUser'].sort());
      });

      expect(calls.groupsAll).toHaveBeenCalledTimes(1);
      expect(calls.projectsAll).toHaveBeenCalledTimes(1);
      expect(calls.usersCurrent).toHaveBeenCalledTimes(1);
    });
  });

  test('concurrent logins with different credentials do not share a walk', () => {
    const plugin: VerdaccioGitlab = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);

    // Start both before either resolves. If the in-flight key ignored the
    // password, the wrong-password login would join the valid walk and succeed.
    const valid = authenticate(plugin, config.user, config.pass);
    const invalid = authenticate(plugin, config.user, config.pass + '_wrong');

    return Promise.all([
      valid,
      invalid.then(
        () => {
          throw new Error('authentication with a wrong password should have failed');
        },
        error => error
      ),
    ]).then(([groups, error]) => {
      expect(groups).toContain('myGroup');
      expect(error).toBeTruthy();
      expect(calls.usersCurrent).toHaveBeenCalledTimes(2);
    });
  });

  test('a failed walk is not cached, so the next login retries', () => {
    const plugin: VerdaccioGitlab = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);
    const wrongPass = config.pass + '_wrong';

    return authenticate(plugin, config.user, wrongPass)
      .then(
        () => {
          throw new Error('authentication should have failed');
        },
        () => authenticate(plugin, config.user, wrongPass).then(
          () => {
            throw new Error('authentication should have failed');
          },
          () => {
            // Two attempts must reach gitlab: a rejected walk must not leave a
            // stale entry that makes later logins fail without asking.
            expect(calls.usersCurrent).toHaveBeenCalledTimes(2);
          }
        )
      );
  });

  test('group and project queries ask for the maximum page size', () => {
    const plugin: VerdaccioGitlab = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);

    return authenticate(plugin, config.user, config.pass).then(() => {
      // The client decamelizes these into min_access_level=40&per_page=100.
      const expected = { minAccessLevel: 40, perPage: 100 };

      expect(calls.groupsAll).toHaveBeenCalledWith(expected);
      expect(calls.projectsAll).toHaveBeenCalledWith(expected);
    });
  });
});
