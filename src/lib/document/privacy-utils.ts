/**
 * A cheap document revision marker used to bind findings to the exact text
 * that produced them. This is a correctness guard, not a cryptographic hash.
 */
export function documentFingerprint(source: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${source.length}:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`;
}
