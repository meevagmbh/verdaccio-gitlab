import * as GitbeakerRest from '@gitbeaker/rest';

import VerdaccioGitlab from '../../src/gitlab';
import { requesterFn } from '../../src/gitlab-requester';

import config from './partials/config';

// The gitlab client is told where to send the user's token. A wrong option
// name silently falls back to the client's default host (gitlab.com), so the
// options are part of the plugin's contract.

const calls = (GitbeakerRest as any).__calls;

function authenticate(plugin: VerdaccioGitlab, user: string, pass: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    plugin.authenticate(user, pass, (err: any, data: any) => (err ? reject(err) : resolve(data)));
  });
}

function constructedOptions(): Record<string, any> {
  const byResource: Record<string, any> = {};
  calls.constructed.mock.calls.forEach(([resource, options]: [string, any]) => {
    byResource[resource] = options;
  });
  return byResource;
}

describe('Gitlab Auth Plugin client options', () => {
  beforeEach(() => {
    calls.constructed.mockClear();
  });

  test('every resource is created with the configured url as host and the password as token', async () => {
    const plugin = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);

    await authenticate(plugin, config.user, config.pass);

    const expected = { host: config.verdaccioGitlabConfig.url, token: config.pass, requesterFn: expect.any(Function) };
    expect(constructedOptions()).toEqual({ Users: expected, Groups: expected, Projects: expected });
  });

  test('every resource uses the plugin requester with the short retry window', async () => {
    const plugin = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);

    await authenticate(plugin, config.user, config.pass);

    Object.values(constructedOptions()).forEach((options) => {
      expect(options.requesterFn).toBe(requesterFn);
    });
  });

  test('a trailing slash in the configured url is dropped from the host', async () => {
    // The client joins host and "api/v4" with a slash, so a trailing slash
    // would produce "//api/v4". The previous client tolerated it.
    const plugin = new VerdaccioGitlab({ ...config.verdaccioGitlabConfig, url: 'https://gitlab.example.com/sub//' }, config.options);

    await authenticate(plugin, config.user, config.pass);

    Object.values(constructedOptions()).forEach((options) => {
      expect(options.host).toBe('https://gitlab.example.com/sub');
    });
  });

  test('without a configured url the client keeps its own default host', async () => {
    // The previous client fell back to https://gitlab.com when no url was
    // set, and so does this one when host is left undefined.
    const plugin = new VerdaccioGitlab({ ...config.verdaccioGitlabConfig, url: undefined as any }, config.options);

    await authenticate(plugin, config.user, config.pass);

    Object.values(constructedOptions()).forEach((options) => {
      expect(options.host).toBeUndefined();
    });
  });
});
