// Copyright 2018 Roger Meier <roger@bufferoverflow.ch>
// SPDX-License-Identifier: MIT

import { errorUtils, pluginUtils } from '@verdaccio/core';
import { Callback, Logger, RemoteUser, PackageAccess } from '@verdaccio/types';
import { Groups, Projects, Users } from '@gitbeaker/rest';

import { requesterFn } from './gitlab-requester';
import { logSafe } from './log-safe';
import { FailedLoginLimiter } from './login-limiter';

import { UserDataGroups } from './authcache';
import { AuthCache, UserData } from './authcache';

export type VerdaccioGitlabAccessLevel = '$guest' | '$reporter' | '$developer' | '$maintainer' | '$owner';

export type VerdaccioGitlabConfig = {
  url: string;
  // Allows an http:// url. Users' GitLab tokens then cross the network in
  // clear text, so this is meant for a GitLab on the same host or network.
  allowInsecureHttp?: boolean;
  authCache?: {
    enabled?: boolean;
    ttl?: number;
  };
  publish?: VerdaccioGitlabAccessLevel;
};

export interface VerdaccioGitlabPackageAccess extends PackageAccess {
  name?: string;
  gitlab?: boolean;
}

const ACCESS_LEVEL_MAPPING = {
  $guest: 10,
  $reporter: 20,
  $developer: 30,
  $maintainer: 40,
  $owner: 50,
};

// List of verdaccio builtin levels that map to anonymous access
const BUILTIN_ACCESS_LEVEL_ANONYMOUS = ['$anonymous', '$all'];

// Level to apply on 'allow_access' calls when a package definition does not define one
const DEFAULT_ALLOW_ACCESS_LEVEL = ['$all'];

// Page size for the group and project queries. The GitLab API defaults to 20
// and caps at 100, and the client passes this straight through to the query
// string, then follows the `Link: rel="next"` header for further pages. On
// an instance with a few hundred projects this is the difference between
// roughly 32 requests per login and roughly 7.
const GITLAB_PAGE_SIZE = 100;

// Group lists can be long; debug logs keep more of them than other fields.
const GROUPS_LOG_LENGTH = 4000;

// GitLab's answers that reject the token itself, as opposed to GitLab being
// unreachable, overloaded or failing.
const TOKEN_REJECTED_STATUSES = [401, 403];

const WRONG_USERNAME = 'wrong gitlab username';
const AUTHENTICATION_ERROR = 'error authenticating user';

// The HTTP status of GitLab's answer, which the request handler attaches as
// error.cause.response; undefined for network errors and timeouts.
function gitlabStatus(error: any): number | undefined {
  return error?.cause?.response?.status;
}

export default class VerdaccioGitLab
  extends pluginUtils.Plugin<VerdaccioGitlabConfig>
  implements pluginUtils.Auth<VerdaccioGitlabConfig>
{
  // The base class stores config and options; this narrows config from unknown.
  declare public readonly config: VerdaccioGitlabConfig;
  private authCache?: AuthCache;
  private logger: Logger;
  private publishLevel: VerdaccioGitlabAccessLevel;
  // The client joins host and "api/v4" with a slash, so a trailing slash in
  // the configured url would turn into "//api/v4". Left undefined without a
  // url, so the client falls back to its default, https://gitlab.com.
  private gitlabHost?: string;
  // Walks that are currently running, keyed by credentials. The auth cache is
  // only written once a walk finishes, so without this every request that
  // arrives while one is in flight starts its own walk against gitlab.
  private inflightWalks: Map<string, Promise<string[]>> = new Map();
  private loginLimiter: FailedLoginLimiter = new FailedLoginLimiter();

  public constructor(config: VerdaccioGitlabConfig, options: pluginUtils.PluginOptions) {
    super(config, options);
    this.logger = options.logger;
    this.logger.info(`[gitlab] url: ${this.config.url}`);
    if (typeof this.config.url === 'string') {
      this.gitlabHost = this._checkedUrl(this.config.url).replace(/\/+$/, '');
    }

    if ((this.config.authCache || {}).enabled === false) {
      this.logger.info('[gitlab] auth cache disabled');
    } else {
      this.authCache = new AuthCache(this.logger, (this.config.authCache || {}).ttl);
      this.logger.info(`[gitlab] initialized auth cache with ttl: ${this.authCache.ttl} seconds`);
    }


    this.publishLevel = '$maintainer';
    if (this.config.publish) {
      this.publishLevel = this.config.publish;
    }

    if (!Object.keys(ACCESS_LEVEL_MAPPING).includes(this.publishLevel)) {
      throw Error(`[gitlab] invalid publish access level configuration: ${this.publishLevel}`);
    }
    this.logger.info(`[gitlab] publish control level: ${this.publishLevel}`);
  }

  // Every user's GitLab token goes to this url, so it has to use TLS unless
  // the operator explicitly accepts plain http.
  private _checkedUrl(url: string): string {
    let protocol: string;
    try {
      protocol = new URL(url).protocol;
    } catch {
      throw Error(`[gitlab] invalid auth.gitlab.url: ${url}`);
    }
    if (protocol === 'https:') {
      return url;
    }
    if (protocol === 'http:') {
      if (this.config.allowInsecureHttp === true) {
        this.logger.warn('[gitlab] auth.gitlab.url uses http: GitLab tokens are sent unencrypted');
        return url;
      }
      throw Error('[gitlab] auth.gitlab.url must use https; set auth.gitlab.allowInsecureHttp: true to accept http');
    }
    throw Error(`[gitlab] auth.gitlab.url must use https, got ${protocol}`);
  }

  public authenticate(user: string, password: string, cb: Callback) {
    this.logger.trace({ user: logSafe(user) }, '[gitlab] authenticate called for user: @{user}');

    // Try to find the user groups in the cache
    const cachedUserGroups = this._getCachedUserGroups(user, password);
    if (cachedUserGroups) {
      this.logger.debug(
        { user: logSafe(user), groups: logSafe(cachedUserGroups.publish.join(', '), GROUPS_LOG_LENGTH) },
        '[gitlab] user: @{user} found in cache, authenticated with groups: @{groups}'
      );
      return cb(null, cachedUserGroups.publish);
    }

    // Not found in cache, query gitlab
    this.logger.trace({ user: logSafe(user) }, '[gitlab] user: @{user} not found in cache');

    const walkKey = AuthCache.generateKeyHash(user, password);

    // GitLab already rejected these credentials within the window.
    const rejection = this.loginLimiter.rejection(user, walkKey);
    if (rejection) {
      this.logger.trace({ user: logSafe(user) }, '[gitlab] user: @{user} credentials already rejected by gitlab');
      return cb(errorUtils.getUnauthorized(rejection));
    }
    if (this.loginLimiter.isBlocked(user)) {
      this.logger.trace({ user: logSafe(user) }, '[gitlab] user: @{user} blocked after too many failed logins');
      return cb(errorUtils.getCode(429, 'too many failed logins, try again later'));
    }

    // A burst of npm requests arrives faster than one walk completes, so join
    // an already running walk for the same credentials instead of starting
    // another. Without this the cache never gets the chance to help.
    let walk = this.inflightWalks.get(walkKey);

    if (walk) {
      this.logger.trace({ user: logSafe(user) }, '[gitlab] user: @{user} joining gitlab query already in flight');
    } else {
      walk = this._queryUserGroups(user, password, walkKey);
      this.inflightWalks.set(walkKey, walk);

      // Release the slot on success and on failure alike, so a rejected walk
      // is never replayed to later logins.
      const release = () => {
        this.inflightWalks.delete(walkKey);
      };
      walk.then(release, release);
    }

    walk.then(
      realGroups => cb(null, realGroups),
      error => cb(error)
    );
  }

  // Resolves to the groups the user may publish to, or rejects with the
  // verdaccio error to hand back. Split out of authenticate() so that a single
  // walk can be shared by concurrent logins.
  // Counts a login GitLab definitely rejected, as opposed to GitLab failing.
  private _recordRejectedLogin(user: string, credentialHash: string, message: string): void {
    if (this.loginLimiter.recordFailure(user, credentialHash, message)) {
      this.logger.warn(
        { user: logSafe(user), max: FailedLoginLimiter.DEFAULT_MAX_FAILURES, window: FailedLoginLimiter.DEFAULT_WINDOW_SECONDS },
        '[gitlab] user: @{user} blocked after @{max} failed logins, for up to @{window} seconds'
      );
    }
  }

  private _queryUserGroups(user: string, password: string, credentialHash: string): Promise<string[]> {
    // Only the three resources the walk needs: the client's all-in-one Gitlab
    // class builds every resource it knows on each login.
    const clientOptions = { host: this.gitlabHost, token: password, requesterFn };
    const users = new Users(clientOptions);
    const groups = new Groups(clientOptions);
    const projects = new Projects(clientOptions);

    return users.showCurrentUser().then(
      response => {
        if (user.toLowerCase() !== response.username.toLowerCase()) {
          this.logger.warn(
            { user: logSafe(user), gitlabUser: logSafe(response.username) },
            '[gitlab] login as user: @{user} rejected, the token belongs to gitlab user: @{gitlabUser}'
          );
          this._recordRejectedLogin(user, credentialHash, WRONG_USERNAME);
          return Promise.reject(errorUtils.getUnauthorized(WRONG_USERNAME));
        }

        const publishLevelId = ACCESS_LEVEL_MAPPING[this.publishLevel];

        // Set the groups of an authenticated user, in normal mode:
        // - for access, depending on the package settings in verdaccio
        // - for publish, the logged in user id and all the groups they can reach as configured with access level `$auth.gitlab.publish`
        const gitlabPublishQueryParams = { minAccessLevel: publishLevelId, perPage: GITLAB_PAGE_SIZE };

        this.logger.trace({ params: JSON.stringify(gitlabPublishQueryParams) }, '[gitlab] querying gitlab user groups with params: @{params}');

        const groupsPromise = groups.all<false, 'offset'>(gitlabPublishQueryParams).then(groupList => {
          return groupList.filter(group => group.path === group.full_path).map(group => group.path);
        });

        const projectsPromise = projects.all<false, 'offset'>(gitlabPublishQueryParams).then(projectList => {
          return projectList.map(project => project.path_with_namespace);
        });

        return Promise.all([groupsPromise, projectsPromise]).then(
          ([groups, projectGroups]) => {
            const realGroups = [user, ...groups, ...projectGroups];
            this._setCachedUserGroups(user, password, { publish: realGroups });
            this.loginLimiter.recordSuccess(user);

            this.logger.info({ user: logSafe(user) }, '[gitlab] user: @{user} successfully authenticated');
            this.logger.debug(
              { user: logSafe(user), groups: logSafe(realGroups.join(', '), GROUPS_LOG_LENGTH) },
              '[gitlab] user: @{user}, with groups: @{groups}'
            );

            return realGroups;
          },
          error => {
            this.logger.error(
              { user: logSafe(user), error: logSafe(error?.message) },
              '[gitlab] user: @{user} error querying gitlab: @{error}'
            );
            return Promise.reject(errorUtils.getUnauthorized(AUTHENTICATION_ERROR));
          }
        );
      },
      error => {
        if (TOKEN_REJECTED_STATUSES.includes(gitlabStatus(error) as number)) {
          this.logger.warn(
            { user: logSafe(user), status: gitlabStatus(error) },
            '[gitlab] login as user: @{user} rejected, gitlab answered @{status} for the token'
          );
          this._recordRejectedLogin(user, credentialHash, AUTHENTICATION_ERROR);
        } else {
          this.logger.error(
            { user: logSafe(user), error: logSafe(error?.message) },
            '[gitlab] user: @{user} error querying gitlab user data: @{error}'
          );
        }
        return Promise.reject(errorUtils.getUnauthorized(AUTHENTICATION_ERROR));
      }
    );
  }

  public adduser(user: string, password: string, cb: Callback) {
    this.logger.trace({ user: logSafe(user) }, '[gitlab] adduser called for user: @{user}');
    return cb(null, true);
  }

  public changePassword(user: string, password: string, newPassword: string, cb: Callback) {
    this.logger.trace({ user: logSafe(user) }, '[gitlab] changePassword called for user: @{user}');
    return cb(errorUtils.getInternalError('You are using verdaccio-gitlab integration. Please change your password in gitlab'));
  }

  public allow_access(user: RemoteUser, _package: VerdaccioGitlabPackageAccess & PackageAccess, cb: Callback) {
    if (!_package.gitlab) return cb(null, false);

    const packageAccess = _package.access && _package.access.length > 0 ? _package.access : DEFAULT_ALLOW_ACCESS_LEVEL;

    if (user.name !== undefined) {
      // successfully authenticated
      this.logger.debug(
        { user: logSafe(user.name), pkg: logSafe(_package.name) },
        '[gitlab] allow user: @{user} authenticated access to package: @{pkg}'
      );
      return cb(null, true);
    } else {
      // unauthenticated
      if (BUILTIN_ACCESS_LEVEL_ANONYMOUS.some(level => packageAccess.includes(level))) {
        this.logger.debug({ pkg: logSafe(_package.name) }, '[gitlab] allow anonymous access to package: @{pkg}');
        return cb(null, true);
      } else {
        this.logger.info({ pkg: logSafe(_package.name) }, '[gitlab] deny anonymous access to package: @{pkg}');
        return cb(errorUtils.getUnauthorized('access denied, user not authenticated and anonymous access disabled'));
      }
    }
  }

  public allow_publish(user: RemoteUser, _package: VerdaccioGitlabPackageAccess & PackageAccess, cb: Callback) {
    if (!_package.gitlab) return cb(null, false);

    const packageScopePermit = false;
    let packagePermit = false;
    // Only allow to publish packages when:
    //  - the package has exactly the same name as one of the user groups, or
    //  - the package scope is the same as one of the user groups
    for (const real_group of user.real_groups) {
      // jscs:ignore requireCamelCaseOrUpperCaseIdentifiers
      this.logger.trace(
        { group: logSafe(real_group), user: logSafe(user.name || ''), pkg: logSafe(_package.name) },
        '[gitlab] publish: checking group: @{group} for user: @{user} and package: @{pkg}'
      );

      if (this._matchGroupWithPackage(real_group, _package.name as string)) {
        packagePermit = true;
        break;
      }
    }

    if (packagePermit || packageScopePermit) {
      const perm = packagePermit ? 'package-name' : 'package-scope';
      this.logger.debug(
        { user: logSafe(user.name || ''), pkg: logSafe(_package.name), perm },
        '[gitlab] user: @{user} allowed to publish package: @{pkg} based on @{perm}'
      );
      return cb(null, true);
    } else {
      this.logger.warn(
        { user: logSafe(user.name || ''), pkg: logSafe(_package.name) },
        '[gitlab] user: @{user} denied from publishing package: @{pkg}'
      );
      // @ts-ignore
      const missingPerm = _package.name.indexOf('@') === 0 ? 'package-scope' : 'package-name';
      return cb(errorUtils.getForbidden(`must have required permissions: ${this.publishLevel || ''} at ${missingPerm}`));
    }
  }

  private _matchGroupWithPackage(real_group: string, package_name: string): boolean {
    if (real_group === package_name) {
      return true;
    }

    if (package_name.indexOf('@') === 0) {
      const split_real_group = real_group.split('/');
      const split_package_name = package_name.slice(1).split('/');

      if (split_real_group.length > split_package_name.length) {
        return false;
      }

      for (let i = 0; i < split_real_group.length; i += 1) {
        if (split_real_group[i] !== split_package_name[i]) {
          return false;
        }
      }

      return true;
    }

    return false;
  }

  private _getCachedUserGroups(username: string, password: string): UserDataGroups | null {
    if (!this.authCache) {
      return null;
    }
    const userData = this.authCache.findUser(username, password);
    return (userData || {}).groups || null;
  }

  private _setCachedUserGroups(username: string, password: string, groups: UserDataGroups): boolean {
    if (!this.authCache) {
      return false;
    }
    this.logger.debug({ user: logSafe(username) }, '[gitlab] saving data in cache for user: @{user}');
    return this.authCache.storeUser(username, password, new UserData(username, groups));
  }
}
