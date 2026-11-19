// The groups the plugin hands verdaccio for a user ("real groups").
//
// verdaccio passes allow_access and allow_publish only the user's
// real_groups strings, and stores them in its tokens. So one list carries
// both roles: an entry the user may publish to appears plainly, an entry the
// user may only read is marked with READ_ONLY_PREFIX. A GitLab path cannot
// contain a colon, so a marked entry never collides with a real path.

export const READ_ONLY_PREFIX = 'gitlab-read:';

// The user name and the publish paths plainly, then the paths the user may
// only read, marked. Each path appears once, which keeps verdaccio's tokens
// small.
export function encodeRealGroups(user: string, publishPaths: string[], accessPaths: string[]): string[] {
  const publishable = new Set([user, ...publishPaths]);
  const readOnly = [...new Set(accessPaths)].filter((path) => !publishable.has(path));
  return [...publishable, ...readOnly.map((path) => READ_ONLY_PREFIX + path)];
}

// The paths the user may publish to: only the plain entries.
export function publishablePaths(realGroups: string[]): Set<string> {
  return new Set(realGroups.filter((group) => !group.startsWith(READ_ONLY_PREFIX)));
}

// The paths the user may read: every entry, without the read-only mark.
export function readablePaths(realGroups: string[]): Set<string> {
  return new Set(realGroups.map((group) => (group.startsWith(READ_ONLY_PREFIX) ? group.slice(READ_ONLY_PREFIX.length) : group)));
}
