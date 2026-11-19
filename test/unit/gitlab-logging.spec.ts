import type { Mock } from 'vitest';
import { RemoteUser } from '@verdaccio/types';

import VerdaccioGitlab, { VerdaccioGitlabPackageAccess } from '../../src/gitlab';
import { logSafe } from '../../src/log-safe';

import logger from './partials/logger';
import config from './partials/config';

// verdaccio's pretty log format resolves @{field} placeholders in the message
// and inserts string values verbatim. So request data must travel as fields,
// never inside the message template, and must not carry line breaks.

const FORGED = 'evil\n info --- [gitlab] user: root successfully authenticated @{password}';

const LEVELS = ['error', 'warn', 'info', 'debug', 'trace'] as const;

function loggedCalls(): any[][] {
  return LEVELS.flatMap((level) => (logger[level] as Mock).mock.calls);
}

function templates(): string[] {
  return loggedCalls().map((args) => (typeof args[0] === 'string' ? args[0] : args[1]));
}

function fields(): Record<string, unknown>[] {
  return loggedCalls()
    .filter((args) => typeof args[0] === 'object')
    .map((args) => args[0]);
}

function callbackResult(invoke: (cb: (err: any, data?: any) => void) => void): Promise<void> {
  return new Promise((resolve) => invoke(() => resolve()));
}

describe('logSafe', () => {
  test('replaces control characters', () => {
    expect(logSafe('a\nb\rc\u001bd\u2028e')).toBe('a?b?c?d?e');
  });

  test('caps the length', () => {
    expect(logSafe('x'.repeat(500))).toBe('x'.repeat(200) + '…');
  });

  test('turns non-strings into strings', () => {
    expect(logSafe(undefined)).toBe('undefined');
  });
});

describe('Gitlab Auth Plugin logging of request data', () => {
  let plugin: VerdaccioGitlab;

  beforeEach(() => {
    plugin = new VerdaccioGitlab(config.verdaccioGitlabConfig, config.options);
    vi.clearAllMocks();
  });

  const pkg: VerdaccioGitlabPackageAccess = { name: FORGED, access: ['$authenticated'], gitlab: true };
  const user: RemoteUser = { real_groups: [FORGED], groups: [FORGED], name: FORGED };
  const anonymous: RemoteUser = { real_groups: [], groups: [], name: undefined };

  const paths: [string, () => Promise<void>][] = [
    ['authenticate', () => callbackResult((cb) => plugin.authenticate(FORGED, 'wrong', cb))],
    ['adduser', () => callbackResult((cb) => plugin.adduser(FORGED, 'wrong', cb))],
    ['changePassword', () => callbackResult((cb) => plugin.changePassword(FORGED, 'wrong', 'new', cb))],
    ['allow_access', () => callbackResult((cb) => plugin.allow_access(user, pkg, cb))],
    ['allow_access anonymous', () => callbackResult((cb) => plugin.allow_access(anonymous, pkg, cb))],
    ['allow_publish', () => callbackResult((cb) => plugin.allow_publish(user, pkg, cb))],
  ];

  test.each(paths)('%s keeps request data out of the message template', async (_name, run) => {
    await run();

    expect(templates().length).toBeGreaterThan(0);
    templates().forEach((template) => {
      expect(template).not.toContain('evil');
    });
  });

  test.each(paths)('%s logs request data without line breaks', async (_name, run) => {
    await run();

    const values = fields().flatMap((field) => Object.values(field));
    expect(values.some((value) => String(value).includes('evil'))).toBe(true);
    values.forEach((value) => {
      expect(String(value)).not.toMatch(/[\r\n]/);
    });
  });

  test('a failed gitlab query never logs the password', async () => {
    await callbackResult((cb) => plugin.authenticate(config.user, 'wrong-secret-token', cb));

    loggedCalls().forEach((args) => {
      expect(JSON.stringify(args)).not.toContain('wrong-secret-token');
    });
  });
});
