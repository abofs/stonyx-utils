export function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function objToJson(obj: JsonValue | Record<string, unknown>, format: string | number = '\t'): string {
  return JSON.stringify(obj, null, format);
}

export function makeArray<T>(obj: T | T[]): T[] {
  return Array.isArray(obj) ? obj : [obj];
}

function cloneShallow<T>(value: T): T {
  if (Array.isArray(value)) return value.slice() as T;
  if (value && typeof value === 'object') return { ...value };
  return value;
}

interface MergeOptions {
  ignoreNewKeys?: boolean;
}

export function mergeObject(obj1: Record<string, unknown>, obj2: Record<string, unknown>, options: MergeOptions = {}): Record<string, unknown> {
  if (Array.isArray(obj1) || Array.isArray(obj2)) throw new Error('Cannot merge arrays.');

  if (obj1 === null || typeof obj1 !== 'object') return cloneShallow(obj2);
  if (obj2 === null || typeof obj2 !== 'object') return cloneShallow(obj1);

  const result: Record<string, unknown> = {};

  for (const key of Object.keys(obj1))  result[key] = cloneShallow(obj1[key]);
  for (const key of Object.keys(obj2)) {
    if (options.ignoreNewKeys && !(key in obj1)) continue;

    const val1 = obj1[key];
    const val2 = obj2[key];
    const shouldMerge = val1 && val2 && typeof val1 === 'object' && typeof val2 === 'object' && !Array.isArray(val1) && !Array.isArray(val2);
    result[key] = shouldMerge ? mergeObject(val1 as Record<string, unknown>, val2 as Record<string, unknown>, options) : cloneShallow(val2);

  }

  return result;
}

export function get(obj: Record<string, unknown>, path: string): unknown;
export function get(obj: unknown, path?: unknown): undefined;
export function get(obj: unknown, path?: unknown): unknown {
  if (arguments.length !== 2) return console.error('Get must be called with two arguments; an object and a property key.');
  if (!obj) return console.error(`Cannot call get with '${path}' on an undefined object.`);
  if (typeof path !== 'string') return console.error('The path provided to get must be a string.');

  let current: Record<string, unknown> = obj as Record<string, unknown>;
  for (const key of path.split('.')) {
    if (current[key] === undefined) return;

    current = current[key] as Record<string, unknown>;
  }

  return current;
}

export function getOrSet<K, V>(map: Map<K, V>, key: K, defaultValue: V | (() => V)): V {
  if (!(map instanceof Map)) throw new Error('First argument to getOrSet must be a Map.');

  if (!map.has(key)) {
    const value = typeof defaultValue === 'function' ? (defaultValue as () => V)() : defaultValue;
    map.set(key, value);
  }

  return map.get(key) as V;
}
