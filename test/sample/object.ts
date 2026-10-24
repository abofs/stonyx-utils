/**
 * Canonical usage of @stonyx/utils/object. Nothing runs at import time.
 */
import { deepCopy, objToJson, makeArray, mergeObject, get, getOrSet } from '@stonyx/utils/object';

/** deepCopy returns a detached clone, so edits to the copy leave the original alone. */
export function copyAndEdit(): { original: { tags: string[] }; copy: { tags: string[] } } {
  const original = { tags: ['a'] };
  const copy = deepCopy(original);

  copy.tags.push('b');

  return { original, copy };
}

/** objToJson pretty-prints with a tab by default, or with any JSON.stringify indent. */
export function serialize(): { tabbed: string; twoSpaces: string } {
  const settings = { port: 3000 };

  return {
    tabbed: objToJson(settings),
    twoSpaces: objToJson(settings, 2),
  };
}

/** makeArray wraps a single value and passes an array through unchanged. */
export function normalizeToArray(): { single: string[]; many: string[] } {
  return {
    single: makeArray('admin'),
    many: makeArray(['admin', 'editor']),
  };
}

/** mergeObject deep-merges; ignoreNewKeys keeps only keys the base already has. */
export function mergeConfig(): { merged: Record<string, unknown>; knownKeysOnly: Record<string, unknown> } {
  const defaults = { server: { port: 3000, host: 'localhost' }, debug: false };
  const overrides = { server: { port: 8080 }, extra: true };

  return {
    merged: mergeObject(defaults, overrides),
    knownKeysOnly: mergeObject(defaults, overrides, { ignoreNewKeys: true }),
  };
}

/** get reads a nested value by dot path and returns undefined when any segment is absent. */
export function readNested(): { host: unknown; missing: unknown } {
  const config = { server: { network: { host: 'example.com' } } };

  return {
    host: get(config, 'server.network.host'),
    missing: get(config, 'server.tls.cert'),
  };
}

/** getOrSet returns the cached value, or stores a default (a factory runs only on a miss). */
export function cacheByKey(): { first: string[]; second: string[]; sameArray: boolean; size: number } {
  const groups = new Map<string, string[]>();

  const first = getOrSet(groups, 'admins', () => []);
  first.push('alice');
  const second = getOrSet(groups, 'admins', () => ['never used']);

  return { first, second, sameArray: first === second, size: groups.size };
}
