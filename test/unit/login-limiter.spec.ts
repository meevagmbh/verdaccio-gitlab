import { FailedLoginLimiter } from '../../src/login-limiter';

// lru-cache keeps a reference to the global performance object from when it
// loads, so the expiry test loads a fresh copy after the fake timers are set.
function limiterWithFakeClock(): typeof FailedLoginLimiter {
  let isolated: typeof FailedLoginLimiter = FailedLoginLimiter;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    isolated = require('../../src/login-limiter').FailedLoginLimiter;
  });
  return isolated;
}

describe('FailedLoginLimiter', () => {
  test('blocks a user after the maximum number of distinct failed credentials', () => {
    const limiter = new FailedLoginLimiter(3, 300);

    limiter.recordFailure('alice', 'a');
    limiter.recordFailure('alice', 'b');
    expect(limiter.isBlocked('alice')).toBe(false);

    limiter.recordFailure('alice', 'c');
    expect(limiter.isBlocked('alice')).toBe(true);
    expect(limiter.isBlocked('bob')).toBe(false);
  });

  test('counts a repeated credential once', () => {
    const limiter = new FailedLoginLimiter(3, 300);

    for (let i = 0; i < 10; i += 1) {
      limiter.recordFailure('alice', 'same', 'wrong gitlab username');
    }

    expect(limiter.isBlocked('alice')).toBe(false);
    expect(limiter.rejection('alice', 'same')).toBe('wrong gitlab username');
    expect(limiter.rejection('alice', 'other')).toBeUndefined();
  });

  test('treats user names case-insensitively, as gitlab does', () => {
    const limiter = new FailedLoginLimiter(2, 300);

    limiter.recordFailure('Alice', 'a');
    limiter.recordFailure('ALICE', 'b');

    expect(limiter.isBlocked('alice')).toBe(true);
  });

  test('reports when a failure reaches the limit', () => {
    const limiter = new FailedLoginLimiter(2, 300);

    expect(limiter.recordFailure('alice', 'a')).toBe(false);
    expect(limiter.recordFailure('alice', 'b')).toBe(true);
    expect(limiter.recordFailure('alice', 'c')).toBe(false);
  });

  test('a successful login clears the failures', () => {
    const limiter = new FailedLoginLimiter(2, 300);
    limiter.recordFailure('alice', 'a');
    limiter.recordFailure('alice', 'b');

    limiter.recordSuccess('alice');

    expect(limiter.isBlocked('alice')).toBe(false);
    expect(limiter.rejection('alice', 'a')).toBeUndefined();
  });

  test('keeps a bounded number of users', () => {
    const limiter = new FailedLoginLimiter(1, 300, 2);

    limiter.recordFailure('a', 'x');
    limiter.recordFailure('b', 'x');
    limiter.recordFailure('c', 'x');

    expect(limiter.isBlocked('a')).toBe(false);
    expect(limiter.isBlocked('c')).toBe(true);
  });

  describe('with a fake clock', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // lru-cache reads a start time of 0 as "no ttl".
      jest.advanceTimersByTime(1000);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('forgets failures once the window from the first failure has passed', () => {
      const limiter = new (limiterWithFakeClock())(2, 10);

      limiter.recordFailure('alice', 'a');
      jest.advanceTimersByTime(9_000);
      limiter.recordFailure('alice', 'b');
      expect(limiter.isBlocked('alice')).toBe(true);

      jest.advanceTimersByTime(1_001);
      expect(limiter.isBlocked('alice')).toBe(false);
    });
  });
});
