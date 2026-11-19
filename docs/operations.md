# Operating verdaccio-gitlab

This runbook is for people who run a verdaccio registry with this plugin. It
covers what to watch and what to do when logins or package access fail. It
describes the plugin, not a particular installation: where your registry runs,
its config and its backups belong in your own operations documentation.

## How a login works

1. An npm client sends a GitLab user name and a Personal Access Token.
2. The plugin asks GitLab who owns the token (`/api/v4/user`) and rejects the
   login if that is another user.
3. It lists the groups and projects in which the user has at least the
   `auth.gitlab.access` role and at least the `auth.gitlab.publish` role
   (`/api/v4/groups`, `/api/v4/projects`, 100 per page, all pages).
4. It keeps the result in the in-memory authentication cache for
   `authCache.ttl` seconds (default 300).

The token therefore needs the `read_api` scope.

How often step 2–4 run depends on verdaccio's token setting:

- **Legacy tokens** (verdaccio's default, `security.api.legacy`): verdaccio
  hands every npm request back to the plugin, which answers from its cache or
  asks GitLab again. A change in GitLab takes effect within `authCache.ttl`
  (plus verdaccio's own `server.legacyAuthCache` ttl, if you enabled it).
- **JWT tokens** (`security.api.jwt`): verdaccio puts the user's groups into
  the token at login and does not ask the plugin again until the token
  expires. A change in GitLab, including a revoked token, takes effect only
  when the npm token expires (`security.api.jwt.sign.expiresIn`).

## What to watch

<!-- markdownlint-disable MD013 -->

| Signal                                                                               | Source                            | Meaning                                                | Suggested alert               |
| ------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------ | ----------------------------- |
| Container health                                                                     | Docker `HEALTHCHECK` on `/-/ping` | verdaccio answers HTTP                                 | unhealthy for 2 checks        |
| `[gitlab] user: … error querying gitlab user data: …`                                | log, level `error`                | GitLab unreachable, timed out or failing               | more than a few per 5 minutes |
| `[gitlab] user: … error querying gitlab: …`                                          | log, level `error`                | GitLab failed while listing groups or projects         | more than a few per 5 minutes |
| `GitLab answered 429 to … attempts within the 5000 ms retry window`                  | inside the error lines above      | GitLab rate-limits the registry                        | any                           |
| `[gitlab] user: … blocked after … failed logins …`                                   | log, level `warn`                 | a user name hit the failed-login limit                 | any                           |
| `[gitlab] login as user: … rejected …`                                               | log, level `warn`                 | GitLab rejected a token, or it belongs to another user | high rate only                |
| `[gitlab] user: … denied access to package: …` / `denied from publishing package: …` | log, level `warn`                 | a role is missing                                      | none; use for support         |

<!-- markdownlint-enable MD013 -->

The `error` lines are the ones that hit every user at once. The health check
does not include GitLab on purpose: when GitLab is down, the registry still
serves packages to clients whose credentials are cached and to anonymous
sections.

## Incidents

### Every new login fails with `error authenticating user`

Cause: GitLab cannot be reached or fails. Clients with a cached login keep
working until their cache entry expires.

1. Look for `error querying gitlab` lines; the text after the colon is the
   cause (DNS, connection refused, timeout, 5xx, 429).
2. From the registry's network, check that GitLab answers:
   `wget -qO- https://<gitlab>/api/v4/version` (a 401 is fine: GitLab is up).
3. Behind a proxy: the GitLab calls use Node's `fetch`, which only uses
   `http_proxy`/`https_proxy`/`no_proxy` when Node starts with
   `NODE_USE_ENV_PROXY=1`.
4. A redirect is refused on purpose (`GitLab answered 30x redirect to …`):
   set `auth.gitlab.url` to the final address.
5. Once GitLab answers again, logins recover on their own. Nothing in the
   plugin needs a reset.

### Logins fail with `GitLab answered 429`

GitLab rate-limits the registry. The plugin retries for 5 seconds and then
gives up.

- Raise GitLab's rate limits for the registry's address, or
- raise `authCache.ttl` so fewer requests reach GitLab.

### A user gets `429 too many failed logins, try again later`

GitLab rejected `failedLogins.maxFailures` (default 10) different tokens for
this user name within `failedLogins.windowSeconds` (default 300). The block
lifts by itself one window after the first failure.

1. Have the user create a fresh token with the `read_api` scope and log in
   again with exactly the GitLab user name.
2. To lift the block at once, restart the registry. This also clears the
   authentication cache for everyone, so expect a burst of GitLab requests.
3. Many blocked user names at once point to someone guessing tokens: check
   the reverse proxy's access log and rate-limit there.

### A token was leaked or must stop working now

1. Revoke the token in GitLab.
2. With legacy tokens, it stops working within `authCache.ttl`. Restart the
   registry to make it immediate.
3. With JWT tokens, verdaccio does not ask the plugin again before the npm
   token expires. To cut access at once, rotate verdaccio's signing secret
   as its security documentation describes; every user then has to log in
   again.

### A user cannot read or publish a package (403)

The error names the missing role, e.g.
`must have required permissions: $maintainer at package-scope`.

1. Check the user's role in GitLab on the group or project that matches the
   package: `@group/pkg` matches group `group` or project `group/pkg`; `pkg`
   matches group `pkg` or the user name.
2. Only top-level groups count. A role in a subgroup grants nothing.
3. After a role change, the user logs in again (`npm login`), or waits for
   `authCache.ttl`; with JWT tokens, logging in again is required.

## Restarts and upgrades

- The authentication cache and the failed-login counts live in memory. A
  restart empties both; the first request of each user then goes to GitLab.
- With several verdaccio processes or containers, each has its own cache and
  counts.
- Packages live in verdaccio's storage directory (`/verdaccio/storage` in the
  image). Back it up together with the config; the plugin keeps no state of
  its own.
- Read `CHANGELOG.md` before upgrading. Breaking changes are listed first.
