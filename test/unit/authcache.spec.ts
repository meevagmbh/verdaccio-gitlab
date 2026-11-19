import { AuthCache, UserData } from '../../src/authcache';

import logger from './partials/logger';
import config from './partials/config';

// lru-cache keeps a reference to the global performance object from when it
// loads, and Jest swaps that object for a fake one, so the expiry tests load
// a fresh copy of the cache after the fake timers are in place.
function authCacheWithFakeClock(): typeof AuthCache {
  let isolated: typeof AuthCache = AuthCache;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    isolated = require('../../src/authcache').AuthCache;
  });
  return isolated;
}

describe('AuthCache Unit Tests', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // The fake performance.now() starts at 0, and lru-cache reads a start
    // time of 0 as "no ttl", so move the clock off zero first.
    jest.advanceTimersByTime(1000);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should create an AuthCache instance', () => {
    const authCache: AuthCache = new AuthCache(logger, AuthCache.DEFAULT_TTL);

    expect(authCache).toBeTruthy();
  });

  test('should create an AuthCache instance with default ttl', () => {
    const authCache: AuthCache = new AuthCache(logger);

    expect(authCache).toBeTruthy();
    expect(authCache.ttl).toBe(AuthCache.DEFAULT_TTL);
  });

  test('should store and find some user data', () => {
    const authCache: AuthCache = new AuthCache(logger);

    authCache.storeUser(config.user, config.pass, config.userData);
    const returnedData: UserData = authCache.findUser(config.user, config.pass);

    expect(returnedData).toEqual(config.userData);
  });

  test('should not find user data stored with another password', () => {
    const authCache: AuthCache = new AuthCache(logger);

    authCache.storeUser(config.user, config.pass, config.userData);

    expect(authCache.findUser(config.user, config.pass + '_other')).toBeUndefined();
  });

  test('should forget user data once the ttl has passed', () => {
    const authCache: AuthCache = new (authCacheWithFakeClock())(logger, 10);

    authCache.storeUser(config.user, config.pass, config.userData);
    jest.advanceTimersByTime(9_999);
    expect(authCache.findUser(config.user, config.pass)).toEqual(config.userData);

    jest.advanceTimersByTime(2);
    expect(authCache.findUser(config.user, config.pass)).toBeUndefined();
  });

  test('should purge expired user data without a lookup and log it', () => {
    const authCache: AuthCache = new (authCacheWithFakeClock())(logger, 10);

    authCache.storeUser(config.user, config.pass, config.userData);
    jest.advanceTimersByTime(11_000);

    expect(authCache.size).toBe(0);
    expect(logger.trace).toHaveBeenCalledWith({ key: expect.any(String), groups: config.userData.groups }, expect.stringContaining('[gitlab] expired key:'));
  });

  // Cached credentials must expire: a token revoked in GitLab would otherwise
  // keep working until verdaccio restarts.
  test.each([0, -1, Number.NaN])('should fall back to the default ttl and warn for ttl %p', ttl => {
    const authCache: AuthCache = new AuthCache(logger, ttl);

    expect(authCache.ttl).toBe(AuthCache.DEFAULT_TTL);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('authCache.ttl'));
  });

  test('should drop the least recently used entry once the cache is full', () => {
    const authCache: AuthCache = new AuthCache(logger, AuthCache.DEFAULT_TTL, 2);

    authCache.storeUser('first', config.pass, config.userData);
    authCache.storeUser('second', config.pass, config.userData);
    authCache.storeUser('third', config.pass, config.userData);

    expect(authCache.findUser('first', config.pass)).toBeUndefined();
    expect(authCache.findUser('second', config.pass)).toEqual(config.userData);
    expect(authCache.findUser('third', config.pass)).toEqual(config.userData);
  });

  test('should hold up to 10000 entries by default', () => {
    expect(AuthCache.DEFAULT_MAX_ENTRIES).toBe(10_000);
  });
});
