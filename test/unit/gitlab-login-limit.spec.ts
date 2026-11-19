import * as GitbeakerRest from '@gitbeaker/rest';

import VerdaccioGitlab from '../../src/gitlab';
import { FailedLoginLimiter } from '../../src/login-limiter';

import config from './partials/config';

// Failed logins per user name are limited, so guessing tokens or stuffing
// leaked credentials cannot hammer GitLab through verdaccio. Only GitLab
// rejecting the token counts: a GitLab outage must not lock users out.

const calls = (GitbeakerRest as any).__calls;
const gitlabUser = calls.usersCurrent.getMockImplementation();

function authenticate(plugin: VerdaccioGitlab, user: string, pass: string): Promise<any> {
  return new Promise(resolve => plugin.authenticate(user, pass, (err: any, groups: any) => resolve(err || groups)));
}

async function failDistinct(plugin: VerdaccioGitlab, count: number) {
  for (let i = 0; i < count; i += 1) {
    await authenticate(plugin, config.user, `wrong-${i}`);
  }
}

const MAX = FailedLoginLimiter.DEFAULT_MAX_FAILURES;

describe('Gitlab Auth Plugin failed login limit', () => {
  let plugin: VerdaccioGitlab;

  beforeEach(() => {
    plugin = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);
    calls.usersCurrent.mockClear();
  });

  afterEach(() => {
    calls.usersCurrent.mockImplementation(gitlabUser);
  });

  test('blocks further logins of a user with 429 without asking gitlab', async () => {
    await failDistinct(plugin, MAX);
    calls.usersCurrent.mockClear();

    const result = await authenticate(plugin, config.user, config.pass);

    expect(result.status).toBe(429);
    expect(calls.usersCurrent).not.toHaveBeenCalled();
  });

  test('keeps answering 401 below the limit', async () => {
    await failDistinct(plugin, MAX - 1);

    const result = await authenticate(plugin, config.user, 'wrong-last');

    expect(result.status).toBe(401);
  });

  test('a credential gitlab already rejected is refused without asking gitlab again', async () => {
    await authenticate(plugin, config.user, 'expired');
    calls.usersCurrent.mockClear();

    const results = await Promise.all([1, 2, 3].map(() => authenticate(plugin, config.user, 'expired')));

    results.forEach(result => expect(result.status).toBe(401));
    expect(calls.usersCurrent).not.toHaveBeenCalled();
  });

  test('a cached successful login still works while the user is blocked', async () => {
    await authenticate(plugin, config.user, config.pass);
    await failDistinct(plugin, MAX);

    const result = await authenticate(plugin, config.user, config.pass);

    expect(Array.isArray(result)).toBe(true);
  });

  test('a gitlab outage does not count as a failed login', async () => {
    calls.usersCurrent.mockImplementation(() => Promise.reject(calls.gitlabError(502, 'Bad Gateway')));
    await failDistinct(plugin, MAX + 2);
    calls.usersCurrent.mockImplementation(gitlabUser);

    const result = await authenticate(plugin, config.user, config.pass);

    expect(Array.isArray(result)).toBe(true);
  });

  test('a token of another gitlab user counts as a failed login and keeps its answer', async () => {
    const first = await authenticate(plugin, config.user, calls.OTHER_TOKEN);
    calls.usersCurrent.mockClear();

    const result = await authenticate(plugin, config.user, calls.OTHER_TOKEN);

    expect(result.status).toBe(401);
    expect(result.message).toBe(first.message);
    expect(calls.usersCurrent).not.toHaveBeenCalled();
  });
});
