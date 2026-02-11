# Improvements

Known code issues and suggested fixes for `@stonyx/utils`.

---

## 1. Filename typo: `plurarize.js` should be `pluralize.js`

**Files affected:**
- `src/plurarize.js` (source)
- `test/unit/string/plurarize-test.js` (test)
- `src/string.js` (re-export references `./plurarize.js`)

**Details:**
The filename `plurarize.js` is missing the second "l" — it should be `pluralize.js`. The typo is propagated to the test file (`plurarize-test.js`) and the re-export in `src/string.js`:

```js
// src/string.js, line 35
export { default as pluralize } from './plurarize.js';
```

**Suggested fix:**
Rename `src/plurarize.js` to `src/pluralize.js`, rename `test/unit/string/plurarize-test.js` to `test/unit/string/pluralize-test.js`, and update the import path in `src/string.js`.

---

## 2. Self-referential package imports in `src/file.js`

**File:** `src/file.js`

**Details:**
`src/file.js` imports from its own package using the published package specifier:

```js
// src/file.js, lines 1-3
import { getTimestamp } from '@stonyx/utils/date';
import { kebabCaseToCamelCase } from '@stonyx/utils/string';
import { objToJson } from '@stonyx/utils/object';
```

These self-referential imports resolve correctly in local development (Node respects the `exports` map for the current package) but are fragile for a published package — they rely on Node's self-referencing behavior, which can break in certain bundler or monorepo resolution scenarios.

**Suggested fix:**
Use relative imports instead:

```js
import { getTimestamp } from './date.js';
import { kebabCaseToCamelCase } from './string.js';
import { objToJson } from './object.js';
```

---

## 3. `get()` uses `console.error` instead of throwing

**File:** `src/object.js`, lines 42-44

**Details:**
The `get()` function uses `console.error` and returns `undefined` for invalid arguments:

```js
export function get(obj, path) {
  if (arguments.length !== 2) return console.error('Get must be called with two arguments; an object and a property key.');
  if (!obj) return console.error(`Cannot call get with '${path}' on an undefined object.`);
  if (typeof path !== 'string') return console.error('The path provided to get must be a string.');
  ...
}
```

This is inconsistent with other functions in the same module — `mergeObject` throws `new Error('Cannot merge arrays.')` and `getOrSet` throws `new Error('First argument to getOrSet must be a Map.')`. The `console.error` approach silently returns `undefined` (the return value of `console.error`), making bugs harder to catch in calling code.

**Suggested fix:**
Replace `console.error` calls with `throw new Error(...)` to match the error-handling pattern used by `mergeObject` and `getOrSet`. This would also require updating the tests in `test/unit/object/get-test.js` to use `assert.throws` instead of spying on `console.error`.
