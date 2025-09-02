export function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function objToJson(obj, format='\t') {
  return JSON.stringify(obj, null, format);
}

export function makeArray(obj) {
  return Array.isArray(obj) ? obj : [obj];
}

function cloneShallow(value) {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === 'object') return { ...value };
  return value;
}

export function mergeObject(obj1, obj2, options={}) {
  if (Array.isArray(obj1) || Array.isArray(obj2)) throw new Error('Cannot merge arrays.');

  if (obj1 === null || typeof obj1 !== 'object') return cloneShallow(obj2);
  if (obj2 === null || typeof obj2 !== 'object') return cloneShallow(obj1);

  const result = {};

  for (const key of Object.keys(obj1))  result[key] = cloneShallow(obj1[key]);
  for (const key of Object.keys(obj2)) {
    if (options.ignoreNewKeys && !(key in obj1)) continue;

    const val1 = obj1[key];
    const val2 = obj2[key];
    const shouldMerge = val1 && val2 && typeof val1 === 'object' && typeof val2 === 'object' && !Array.isArray(val1) && !Array.isArray(val2);
    result[key] = shouldMerge ? mergeObject(val1, val2, options) : cloneShallow(val2);
    
  }

  return result;
}

export function get(obj, path) {
  if (arguments.length !== 2) return console.error('Get must be called with two arguments; an object and a property key.');
  if (!obj) return console.error(`Cannot call get with '${path}' on an undefined object.`);
  if (typeof path !== 'string') return console.error('The path provided to get must be a string.');

  for (const key of path.split('.')) {
    if (obj[key] === undefined) return null;

    obj = obj[key];
  }

  return obj;
}

export function getOrSet(map, key, defaultValue) {
  if (!(map instanceof Map)) throw new Error('First argument to getOrSet must be a Map.');
  
  if (!map.has(key)) map.set(key, typeof defaultValue === "function" ? defaultValue() : defaultValue);

  return map.get(key);
}
