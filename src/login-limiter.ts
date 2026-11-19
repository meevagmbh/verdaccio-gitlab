import { LRUCache } from 'lru-cache';

// Limits failed logins per user name. verdaccio passes the plugin neither
// the client address nor the request, so the user name is the only key.
// That lets an attacker block new logins of a known user name for one window;
// logins already in the auth cache keep working.
//
// Only distinct credentials count: an npm client or CI job retrying one
// expired token sends the same failure many times, and that is no attack.
export class FailedLoginLimiter {
  public static readonly DEFAULT_MAX_FAILURES = 10;
  public static readonly DEFAULT_WINDOW_SECONDS = 300;
  // User names are chosen by the client, so the state must stay bounded.
  public static readonly DEFAULT_MAX_ENTRIES = 10_000;

  public readonly maxFailures: number;
  public readonly windowSeconds: number;
  // Lower-cased user name to the hashes of credentials GitLab rejected, each
  // with the message it was rejected with. The window runs from the first
  // failure and is not extended by later ones.
  private readonly failures: LRUCache<string, Map<string, string>>;

  public constructor(
    maxFailures: number = FailedLoginLimiter.DEFAULT_MAX_FAILURES,
    windowSeconds: number = FailedLoginLimiter.DEFAULT_WINDOW_SECONDS,
    maxEntries: number = FailedLoginLimiter.DEFAULT_MAX_ENTRIES
  ) {
    this.maxFailures = maxFailures;
    this.windowSeconds = windowSeconds;
    this.failures = new LRUCache<string, Map<string, string>>({ max: maxEntries, ttl: windowSeconds * 1000, ttlAutopurge: true });
  }

  public isBlocked(user: string): boolean {
    return (this.failures.get(user.toLowerCase())?.size ?? 0) >= this.maxFailures;
  }

  // The message GitLab's earlier rejection of this credential was answered
  // with, so a repeated attempt gets the same answer; undefined if none.
  public rejection(user: string, credentialHash: string): string | undefined {
    return this.failures.get(user.toLowerCase())?.get(credentialHash);
  }

  // Returns true when this failure reaches the limit, so it is logged once.
  public recordFailure(user: string, credentialHash: string, message: string = 'rejected'): boolean {
    const key = user.toLowerCase();
    let rejected = this.failures.get(key);
    if (!rejected) {
      rejected = new Map();
      this.failures.set(key, rejected);
    }
    if (rejected.has(credentialHash) || rejected.size >= this.maxFailures) {
      return false;
    }
    rejected.set(credentialHash, message);
    return rejected.size === this.maxFailures;
  }

  public recordSuccess(user: string): void {
    this.failures.delete(user.toLowerCase());
  }
}
