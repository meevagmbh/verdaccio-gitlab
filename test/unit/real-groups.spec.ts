import { READ_ONLY_PREFIX, encodeRealGroups, publishablePaths, readablePaths } from '../../src/real-groups';

// verdaccio hands the plugin only the user's real_groups strings, so they
// carry both roles: plain entries may be published to, marked entries only
// read. These helpers are the one place that knows the marking.

describe('real groups', () => {
  test('lists the user name and the publish paths plainly, and read-only paths marked', () => {
    const realGroups = encodeRealGroups('alice', ['group', 'group/project'], ['group', 'read-group']);

    expect(realGroups).toEqual(['alice', 'group', 'group/project', `${READ_ONLY_PREFIX}read-group`]);
  });

  test('lists each path once', () => {
    const realGroups = encodeRealGroups('alice', ['group', 'group'], ['read-group', 'read-group', 'alice']);

    expect(realGroups).toEqual(['alice', 'group', `${READ_ONLY_PREFIX}read-group`]);
  });

  test('publishable paths are only the plain entries', () => {
    const realGroups = ['alice', 'group', `${READ_ONLY_PREFIX}read-group`];

    expect([...publishablePaths(realGroups)]).toEqual(['alice', 'group']);
  });

  test('readable paths are the plain and the marked entries, without the mark', () => {
    const realGroups = ['alice', 'group', `${READ_ONLY_PREFIX}read-group`];

    expect([...readablePaths(realGroups)]).toEqual(['alice', 'group', 'read-group']);
  });

  test('round-trips what encodeRealGroups produced', () => {
    const realGroups = encodeRealGroups('alice', ['group'], ['group', 'read-group']);

    expect(publishablePaths(realGroups)).toEqual(new Set(['alice', 'group']));
    expect(readablePaths(realGroups)).toEqual(new Set(['alice', 'group', 'read-group']));
  });
});
