import VerdaccioGitlab from '../../src/gitlab';

import config from './partials/config';

// The plugin sends every user's GitLab token to auth.gitlab.url, so that url
// must use TLS unless the operator explicitly accepts plain http.

function create(gitlabConfig: Record<string, unknown>): VerdaccioGitlab {
  return new VerdaccioGitlab({ ...config.verdaccioGitlabConfig, ...gitlabConfig }, config.options);
}

describe('Gitlab Auth Plugin url configuration', () => {
  test('accepts an https url', () => {
    expect(() => create({ url: 'https://gitlab.example.com' })).not.toThrow();
  });

  test('accepts no url, so the client uses https://gitlab.com', () => {
    expect(() => create({ url: undefined })).not.toThrow();
  });

  test('rejects an http url', () => {
    expect(() => create({ url: 'http://gitlab.example.com' })).toThrow(/allowInsecureHttp/);
  });

  test('accepts an http url when allowInsecureHttp is set', () => {
    expect(() => create({ url: 'http://gitlab', allowInsecureHttp: true })).not.toThrow();
  });

  test.each(['ftp://gitlab.example.com', 'gitlab.example.com', 'file:///etc/passwd'])('rejects %j', (url) => {
    expect(() => create({ url, allowInsecureHttp: true })).toThrow(/auth\.gitlab\.url/);
  });
});
