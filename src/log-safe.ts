// Prepares request data (user names, package names, GitLab error text) for a
// log field. verdaccio's pretty log format inserts string fields verbatim, so a
// line break in a user name would let a client forge further log lines.

const MAX_LENGTH = 200;

// C0 and C1 control characters plus the Unicode line and paragraph separators.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

export function logSafe(value: unknown, maxLength: number = MAX_LENGTH): string {
  const text = String(value).replace(UNSAFE, '?');
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
