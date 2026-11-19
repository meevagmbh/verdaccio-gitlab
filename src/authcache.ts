// Copyright 2018 Roger Meier <roger@bufferoverflow.ch>
// SPDX-License-Identifier: MIT

import Crypto from 'crypto';

import { Logger } from '@verdaccio/types';
import { LRUCache } from 'lru-cache';

export class AuthCache {
  private logger: Logger;
  private storage: LRUCache<string, UserData>;

  // Entry lifetime in seconds.
  public readonly ttl: number;

  public static get DEFAULT_TTL() {
    return 300;
  }

  // Bounds memory: only successful logins are cached, but someone cycling
  // through many valid tokens would otherwise grow the cache without limit.
  public static get DEFAULT_MAX_ENTRIES() {
    return 10_000;
  }

  // Public so the plugin can key its in-flight request map the same way the
  // cache keys entries, without duplicating the hashing rule.
  public static generateKeyHash(username: string, password: string) {
    const sha = Crypto.createHash('sha256');
    sha.update(JSON.stringify({ username: username, password: password }));
    return sha.digest('hex');
  }

  public constructor(logger: Logger, ttl?: number, maxEntries: number = AuthCache.DEFAULT_MAX_ENTRIES) {
    this.logger = logger;
    this.ttl = AuthCache.validTtl(logger, ttl);

    this.storage = new LRUCache<string, UserData>({
      max: maxEntries,
      ttl: this.ttl * 1000,
      // Remove expired entries on a timer too, not only when they are looked up.
      ttlAutopurge: true,
      dispose: (value, key, reason) => {
        if (reason === 'expire') {
          this.logger.trace({ key, groups: value.groups }, '[gitlab] expired key: @{key} with groups: @{groups}');
        }
      },
    });
  }

  // Cached credentials must expire: a token revoked in GitLab would otherwise
  // keep working until verdaccio restarts. So there is no "unlimited" ttl.
  private static validTtl(logger: Logger, ttl?: number): number {
    if (ttl === undefined) {
      return AuthCache.DEFAULT_TTL;
    }
    if (!Number.isFinite(ttl) || ttl <= 0) {
      logger.warn(`[gitlab] authCache.ttl must be a positive number of seconds, got ${ttl}; using ${AuthCache.DEFAULT_TTL}`);
      return AuthCache.DEFAULT_TTL;
    }
    return ttl;
  }

  public get size(): number {
    return this.storage.size;
  }

  public findUser(username: string, password: string): UserData {
    return this.storage.get(AuthCache.generateKeyHash(username, password)) as UserData;
  }

  public storeUser(username: string, password: string, userData: UserData): boolean {
    this.storage.set(AuthCache.generateKeyHash(username, password), userData);
    return true;
  }
}

export type UserDataGroups = {
  publish: string[];
};

export class UserData {
  private _username: string;
  private _groups: UserDataGroups;

  public get username(): string {
    return this._username;
  }
  public get groups(): UserDataGroups {
    return this._groups;
  }
  public set groups(groups: UserDataGroups) {
    this._groups = groups;
  }

  public constructor(username: string, groups: UserDataGroups) {
    this._username = username;
    this._groups = groups;
  }
}
