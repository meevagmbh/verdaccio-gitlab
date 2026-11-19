# Verdaccio-GitLab

Use [GitLab Community Edition](https://gitlab.com/gitlab-org/gitlab-ce)
as authentication provider for the private npm registry
[Verdaccio](https://github.com/verdaccio/verdaccio), the sinopia fork.

[![CI](https://github.com/meevagmbh/verdaccio-gitlab/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/meevagmbh/verdaccio-gitlab/actions/workflows/ci.yml)

This is the meeva fork of
[bufferoverflow/verdaccio-gitlab](https://github.com/bufferoverflow/verdaccio-gitlab),
whose master branch has not changed since September 2021. Clone, report
issues and open pull requests here.

The main goal and differences from other sinopia/verdaccio plugins are
the following:

- no admin token required
- user authenticates with Personal Access Token
- access & publish packages depending on user rights in gitlab

> This is experimental!

## Use it

You need node version 24.x (LTS, codename **Krypton**), the version the
official verdaccio 6 image runs on.

```sh
git clone https://github.com/meevagmbh/verdaccio-gitlab.git
cd verdaccio-gitlab
corepack enable # installs the yarn version pinned in package.json
yarn install
yarn start
```

> **NOTE**: If you are behind a proxy, define the `http_proxy`/`https_proxy`
> (and optionally `no_proxy`) environment variables and also set
> `NODE_USE_ENV_PROXY=1` when starting Node (it is read at startup only).
> Verdaccio uses the proxy variables for its uplinks on its own (they can also
> be set as `http_proxy`/`https_proxy`/`no_proxy` keys in the Verdaccio config,
> globally or per uplink). The GitLab client uses Node's built-in `fetch`, which
> ignores the proxy variables without `NODE_USE_ENV_PROXY=1`.

Verdaccio is now up and running. In order the see this plugin in action, you can
use the following Verdaccio configuration in your `~/.config/verdaccio/config.yaml`.

```yaml
# Verdaccio storage location relative to $HOME/.config/verdaccio
storage: ./storage

listen:
  - 0.0.0.0:4873

auth:
  gitlab:
    url: https://gitlab.com

uplinks:
  npmjs:
    url: https://registry.npmjs.org/

packages:
  # private packages, one entry per GitLab group: readable with the
  # `access` role, publishable with the `publish` role on the group
  '@my-group/*':
    access: $authenticated
    publish: $authenticated
    gitlab: true

  # public npm packages: readable by every logged-in GitLab user,
  # nobody can publish here
  '@*/*':
    access: $authenticated
    proxy: npmjs

  '**':
    access: $authenticated
    proxy: npmjs

# Log level can be changed to info, http etc. for less verbose output
log: { type: stdout, format: pretty, level: debug }
```

Restart Verdaccio and authenticate into it with your credentials

- Username: GitLab username
- Password: [Personal Access Token](https://gitlab.com/profile/personal_access_tokens)

using the Web UI [http://localhost:4873](http://localhost:4873) or via npm CLI:

```sh
npm login --registry http://localhost:4873
```

and publish packages:

```sh
npm publish --registry http://localhost:4873
```

## Access Levels

Access and publish access rights are mapped following the rules below.

verdaccio-gitlab access control will only be applied to package sections that
are marked with `gitlab: true` as in the configuration sample above. If you
wish to disable gitlab authentication to any package config, just remove the
element from the config.

### Access

_access_ is allowed if:

1. the package section's `access` contains `$all` or `$anonymous`: the
   section is public, and anyone may read it, even without logging in, or
2. the user is authenticated and the package name maps to the user's name,
   or to one of the user's GitLab groups or projects, in the same way as for
   _publish_ below.

For 2., the GitLab user must have at least the role set in
`auth.gitlab.access` (default `$reporter`) on the group or project. Other
authenticated users get `403 Forbidden`, anonymous users `401 Unauthorized`.
A section without `access` is not public.

For an internal registry, as in the configuration sample above:

- give every GitLab group that publishes packages its own section with
  `gitlab: true` and `access: $authenticated`, and no `proxy`;
- leave `gitlab: true` off the sections that proxy public npm packages, and
  give them `access: $authenticated` and no `publish`: every logged-in
  GitLab user can read them, nobody can publish to them, and verdaccio
  itself checks them;
- use `$all` nowhere, so nothing is readable without logging in.

The plugin hands verdaccio the user's groups and projects as the user's
groups: those with the publish role by their path, those the user may only
read as `gitlab-read:<path>`. They end up in verdaccio's tokens, so a user
with very many groups and projects gets large tokens.

### Publish

_publish_ is allowed if:

1. the package name matches the GitLab username, or
2. if the package name or scope of the package matches one of the
   user's GitLab groups, or
3. if the package name (possibly scoped) matches on the user's
   GitLab projects.

For 2. and 3., the GitLab user must have the access rights on the group or
project as specified in the `auth.gitlab.publish` setting.

For instance, assuming the following configuration:

```yaml
auth:
  gitlab:
    access: $reporter
    publish: $maintainer
```

The GitLab user `sample_user` has access to:

- Group `group1` as `$maintainer`
- Group `group2` as `$reporter`
- Project `group3/project` as `$maintainer`

Then this user would be able to:

- _access_ any package in a public section, and in sections with
  `access: $authenticated` the packages `sample_user`, `group1`, `group2`,
  any package under `@group1/**` or `@group2/**`, and `@group3/project`
- _publish_ any of the following packages:
  - `sample_user`
  - `group1`
  - any package under `@group1/**`
  - `@group3/project`

There would be an error if the user tried to publish any package under
`@group2/**`, or to read a package under `@group4/**` in a section with
`access: $authenticated`.

## Configuration Options

The full set of configuration options is:

```yaml
auth:
  gitlab:
    url: <url>
    allowInsecureHttp: <boolean>
    access: <string>
    authCache:
      enabled: <boolean>
      ttl: <integer>
    publish: <string>
```

<!-- markdownlint-disable MD013 -->

| Option               | Default       | Type                                                           | Description                                                                                                                                      |
| -------------------- | ------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `url`                | `<empty>`     | url                                                            | mandatory, the url of the gitlab server; must use `https`                                                                                        |
| `allowInsecureHttp`  | `false`       | boolean                                                        | accept an `http` url; users' GitLab tokens then cross the network unencrypted, so only use it for a GitLab on the same host or a trusted network |
| `authCache: enabled` | `true`        | boolean                                                        | activate in-memory authentication cache                                                                                                          |
| `authCache: ttl`     | `300`         | integer                                                        | time-to-live of entries in the authentication cache, in seconds; must be positive                                                                |
| `access`             | `$reporter`   | [`$guest`, `$reporter`, `$developer`, `$maintainer`, `$owner`] | minimum GitLab role on the matching group or project to read packages in sections with `gitlab: true` that are not public                        |
| `publish`            | `$maintainer` | [`$guest`, `$reporter`, `$developer`, `$maintainer`, `$owner`] | group minimum access level of the logged in user required for npm publish operations                                                             |

<!-- markdownlint-enable MD013 -->

## Authentication Cache

In order to avoid too many authentication requests to the underlying
gitlab instance, the plugin provides an in-memory cache that will save
the detected groups of the users for a configurable ttl in seconds.

No clear-text password is saved in-memory, just an SHA-256 hash of
the user+password, plus the groups information.

By default, the cache will be enabled and the credentials will be stored
for 300 seconds. The ttl is checked on access, and expired entries are
also removed on a timer, so data of users not actively interacting with
the system is invalidated as well.

Entries always expire: a `ttl` of `0` or below falls back to the default
of 300 seconds with a warning, so a token revoked in GitLab stops working
within one ttl. The cache holds at most 10000 entries; when it is full,
the least recently used entry is dropped.

> _Please note_ that this implementation is in-memory and not
> multi-process; if the cluster module is used for starting several
> verdaccio processes, each process will store its own copy of the cache,
> so each user will actually be logged in multiple times.

## Failed Logins

Once GitLab has rejected 10 different tokens for one user name within
300 seconds, further logins with new credentials for that user name are
answered with `429 Too Many Requests` for the rest of the 300 seconds,
without asking GitLab. A token GitLab has already rejected is refused
again without asking GitLab, so a client retrying one expired token does
not count against the limit. A successful login clears the count.

Only rejected tokens count (GitLab answering 401 or 403, or a token that
belongs to another GitLab user). GitLab being unreachable or overloaded
does not.

> _Please note_ that verdaccio passes the plugin neither the client
> address nor the request, so the limit applies per user name: someone who
> knows a user name can block new logins for it for up to 300 seconds.
> Logins already in the authentication cache keep working. Like the cache,
> the count is per process. To limit requests per client address, set
> verdaccio's own `userRateLimit` and put a rate limit in the reverse proxy.

## Operations

[docs/operations.md](docs/operations.md) explains what to monitor and what to
do when logins fail, a user is blocked, a token must stop working at once, or
a user cannot read or publish a package.

## Docker

```sh
git clone https://github.com/meevagmbh/verdaccio-gitlab.git
cd verdaccio-gitlab
docker-compose up --build -d
```

- login with user `root` and password `verdaccio` on Gitlab via [http://localhost:50080](http://localhost:50080)
- create a Personal Access Token
- login to the npm registry [http://localhost:4873](http://localhost:4873) via browser
- publish your packages via command line

The Dockerfile provides a [default configuration file](conf/docker.yaml)
that is internally available under `/verdaccio/conf/config.yaml`. In order
to overwrite this configuration you can provide your own file and mount it
on docker startup with the `--volume` option, or equivalent mechanism
(e.g. ConfigMaps on Kubernetes / OpenShift with the
[helm chart](https://github.com/helm/charts/tree/master/stable/verdaccio)).

## Development

### Contributing

Please adhere to the [verdaccio community guidelines](https://github.com/verdaccio/verdaccio/blob/master/CONTRIBUTING.md)
and run all the tests before creating a PR. The commit message shall follow the
conventional changelog as it is enforced via local commit hook using husky and
the [@commitlint/config-conventional](https://github.com/conventional-changelog/commitlint)
rule set. `yarn install` sets up the hook (`.husky/commit-msg`) by pointing
git's `core.hooksPath` at `.husky/_`.

> PR's that do not pass CI will not be reviewed.

### Create a Release

From a clean working tree, run one of the following commands to create a
release:

```sh
yarn release:major
yarn release:minor
yarn release:patch
```

It bumps the version in `package.json`, prepends the release notes generated
by [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog)
from the Conventional Commits since the last tag to `CHANGELOG.md`, commits
both as `chore(release): vX.Y.Z`, creates the `vX.Y.Z` tag and pushes the
branch and the tag to the git remote that points to the repository in
`package.json` (`scripts/release-remote.sh` finds it; the release stops if no
remote or more than one matches).

Finally publish the package to npm:

```sh
yarn npm publish
```

`yarn npm publish` (and `yarn pack`) run the `prepack` script, which lints and
builds `build/` from a clean state before the tarball is created.

### Functional Tests

In order to run functional tests with debug output, set the
`VERDACCIO_DEBUG=true` environment variable,
[as documented by verdaccio](https://github.com/verdaccio/verdaccio/wiki/Running-and-Debugging-tests):

```bash
yarn code:build
VERDACCIO_DEBUG=true yarn test:functional
```

The functional tests start verdaccio from `build/`, so build the plugin first.

## License

[MIT](https://spdx.org/licenses/MIT)
