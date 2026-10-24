[![CI](https://github.com/abofs/stonyx-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/abofs/stonyx-utils/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@stonyx/utils.svg)](https://www.npmjs.com/package/@stonyx/utils)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

# stonyx-utils

Utilities module for the Stonyx Framework. Provides helpers for files, objects, strings, dates, promises, and prompts.

---

## Quick Reference Table

| Category    | Function                | Description                                              |
| ----------- | ----------------------- | -------------------------------------------------------- |
| **File**    | `createFile`            | Create a file (supports JSON serialization).             |
|             | `updateFile`            | Atomically update a file.                                |
|             | `copyFile`              | Copy a file, with optional overwrite.                    |
|             | `readFile`              | Read a file (JSON optional), with missing file callback. |
|             | `deleteFile`            | Delete a file (ignore missing optional).                 |
|             | `deleteFileSync`        | Synchronous `deleteFile`.                                |
|             | `deleteDirectory`       | Recursively delete a directory.                          |
|             | `createDirectory`       | Recursively create a directory.                          |
|             | `createReadStream`      | `fs.createReadStream` on a resolved path.                |
|             | `createWriteStream`     | `fs.createWriteStream` on a resolved path.               |
|             | `forEachFileImport`     | Dynamically import all JS files in a directory.          |
|             | `fileExists`            | Check if a file exists.                                  |
| **Object**  | `deepCopy`              | Deep clone an object or array.                           |
|             | `objToJson`             | Convert object to formatted JSON string.                 |
|             | `makeArray`             | Wrap a value in an array.                                |
|             | `mergeObject`           | Deep merge two objects (ignore new keys optional).       |
|             | `get`                   | Nested property by dot path (`undefined` if absent).     |
|             | `getOrSet`              | Get or set value in a Map.                               |
| **String**  | `kebabCaseToCamelCase`  | Convert kebab-case to camelCase.                         |
|             | `kebabCaseToPascalCase` | Convert kebab-case to PascalCase.                        |
|             | `camelCaseToKebabCase`  | Convert camelCase to kebab-case.                         |
|             | `generateRandomString`  | Generate a random alphanumeric string.                   |
|             | `pluralize`             | Return plural form of English nouns.                     |
| **Date**    | `getTimestamp`          | Return current UNIX timestamp in seconds.                |
| **Promise** | `sleep`                 | Async delay for a given number of seconds.               |
| **Prompt**  | `confirm`               | Prompt user for y/N confirmation.                        |
|             | `prompt`                | Prompt user for free-text input.                         |
| **Fuzzy**   | `FuzzyMatch`            | Word-set name similarity (default export).               |

---

## Table of Contents

* [Installation](#installation)
* [Exports](#exports)
* [Canonical usage](#canonical-usage)
* [File Utils](#file-utils)
* [Object Utils](#object-utils)
* [String Utils](#string-utils)
* [Date Utils](#date-utils)
* [Promise Utils](#promise-utils)
* [Prompt Utils](#prompt-utils)
* [Fuzzy Match](#fuzzy-match)
* [License](#license)

---

## Installation

```bash
npm install @stonyx/utils
```

---

## Exports

There is no root export: import each category from its subpath.

| Import path | Exports |
| ----------- | ------- |
| `@stonyx/utils/file` | [File Utils](#file-utils) |
| `@stonyx/utils/object` | [Object Utils](#object-utils) |
| `@stonyx/utils/string` | [String Utils](#string-utils) |
| `@stonyx/utils/date` | [Date Utils](#date-utils) |
| `@stonyx/utils/promise` | [Promise Utils](#promise-utils) |
| `@stonyx/utils/prompt` | [Prompt Utils](#prompt-utils) |
| `@stonyx/utils/fuzzy-match` | `FuzzyMatch` (default export): word-set name similarity |

```js
import { mergeObject, get } from '@stonyx/utils/object';
import FuzzyMatch from '@stonyx/utils/fuzzy-match';
```

---

## Canonical usage

Runnable, tested samples of every export live in [`test/sample/`](https://github.com/abofs/stonyx-utils/tree/dev/test/sample), one file per import path. They import `@stonyx/utils/<subpath>` exactly as a consumer does, and the test suite runs them against the built package.

---

## File Utils

The File utils wrap the `path` and `fs` libraries to manipulate the local file system asynchronously with full async/await support. Includes creation, reading, updating, copying, deleting files and directories, checking existence, and dynamic importing via `forEachFileImport`.

### Functions

#### `createFile(filePath, data, options={})`

Creates a file at the given path.

* `options.json` — boolean, if true, data will be serialized to JSON.

#### `updateFile(filePath, data, options={})`

Updates a file atomically by writing to a sibling swap file first, then renaming it over the target. Throws if the file does not exist.

* `options.json` — boolean, serialize as JSON.

**Concurrency: last writer wins.** Concurrent `updateFile` calls on the same path are safe — each uses a swap file unique to its process and call, so neither caller's swap file can collide with the other's. The rename-time `ENOENT` and the silent cross-caller byte clobber of [#44](https://github.com/abofs/stonyx-utils/issues/44) are both gone. (`updateFile` still throws `ENOENT` from its own precondition when the target does not exist — that is the documented contract above, and it is unrelated to concurrency.) Calls are not serialized: the surviving value is whichever caller renames last.

**File mode is preserved; other inode metadata is not.** The swap file is created with the target's permission bits and `chmod`ed to them before the rename, so a `0600` file stays `0600`. The `chmod` addresses the open file descriptor rather than the swap path, so it cannot be redirected onto another file by anyone who can write to the directory. ACLs, extended attributes, hard links and ownership are *not* carried across — the target necessarily gets a new inode.

**Swap files after abnormal termination.** Cleanup runs on every failure path `updateFile` controls, but a process killed between the write and the rename leaves a `<path>.temp-<pid>-<token>` sibling behind, and no module ships a sweeper. This is a deliberate trade against the previous whole-second swap name, which was reused — and reuse is exactly the collision that caused #44, so uniqueness has to win. Be precise about what that costs: the old name only ever collapsed two orphans that were abandoned within the *same whole second*, so at any ordinary crash cadence it reclaimed nothing either (measured: five crashes 1200 ms apart leave five orphans under both names). The accumulation uniqueness genuinely adds is confined to a sub-second crash loop. Consumers that persist into a directory they scan, sync or commit should sweep or ignore `*.temp-*` siblings of their targets; an app that runs `git add` over its data directory will otherwise commit one.

#### `copyFile(sourcePath, targetPath, options={})`

Copies a file from source to target.

* `options.overwrite` — boolean, default false.

#### `readFile(filePath, options={})`

Reads a file, optionally parsing JSON.

* `options.json` — boolean
* `options.missingFileCallback` — function called if file doesn’t exist.

#### `deleteFile(filePath, options={})`

Deletes a file.

* `options.ignoreAccessFailure` — boolean, ignores errors if file missing.

#### `deleteFileSync(filePath, options={})`

Synchronous `deleteFile`, with the same `options.ignoreAccessFailure`.

#### `createReadStream(filePath, options?)` / `createWriteStream(filePath, options?)`

`fs.createReadStream` / `fs.createWriteStream` with `filePath` resolved against the working directory first. `options` is passed through to `fs`.

#### `deleteDirectory(dir)`

Recursively deletes a directory.

#### `createDirectory(dir)`

Recursively creates a directory.

#### `forEachFileImport(dir, callback, options={})`

Dynamically imports all `.js` files in a directory and calls `callback(exports, details)`.

|         Option        |   Type  | Default | Description                                               |
| :-------------------: | :-----: | :-----: | :-------------------------------------------------------- |
|      `fullExport`     | Boolean |  false  | If true, callback receives all exports, not just default. |
|       `rawName`       | Boolean |  false  | If true, the file name is not converted to camelCase.     |
| `ignoreAccessFailure` | Boolean |  false  | If true, directory access errors are ignored.             |
|      `recursive`      | Boolean |  false  | If true, recurse into subdirectories.                     |
|   `recursiveNaming`   | Boolean |  false  | If true, prefix imported names with their directory path. |
|      `namePrefix`     | String  |   `""`  | Manual prefix prepended to each imported name.            |

Example:

```js
import { forEachFileImport } from '@stonyx/utils/file';

await forEachFileImport('./utils', (exports, details) => {
  console.log(details.name, exports);
}, { fullExport: true });
```

#### `fileExists(filePath)`

Returns `true` if file exists, else `false`.

---

## Object Utils

Helpers for working with objects and arrays.

### Functions

#### `deepCopy(obj)`

Returns a deep copy of an object or array.

#### `objToJson(obj, format='\t')`

Returns a formatted JSON string.

#### `makeArray(obj)`

Wraps a value in an array if it isn’t already one.

#### `mergeObject(obj1, obj2, options={})`

Deep merges two objects.

* `options.ignoreNewKeys` — boolean, if true, keys not in `obj1` are ignored.

#### `get(obj, path)`

Gets a nested property using dot notation. Returns `undefined` if any segment along the path is `undefined` (a missing key, or a primitive intermediate such as `get({ a: 1 }, 'a.b')`). Only `undefined` is guarded: a `null` intermediate segment throws a `TypeError` (`get({ a: null }, 'a.b')`), and a `null` final value is returned as `null`.

#### `getOrSet(map, key, defaultValue)`

Gets the value for a key in a `Map`, or sets it to `defaultValue` if missing.

---

## String Utils

### Functions

#### `kebabCaseToCamelCase(str)`

Converts `'my-string'` → `'myString'`.

#### `kebabCaseToPascalCase(str)`

Converts `'my-string'` → `'MyString'`.

#### `camelCaseToKebabCase(str)`

Converts `'myString'` → `'my-string'`.

#### `generateRandomString(length=8)`

Generates a random alphanumeric string.

Uses `Math.random`, so it is **not cryptographically secure**: do not use it for tokens, secrets or IDs that must be unguessable. Use `crypto.randomUUID()` or `crypto.randomBytes()` from `node:crypto` for those.

#### `pluralize(word)`

Returns the plural form of an English noun, handling irregulars and uncountable nouns.

Example:

```js
import { pluralize } from '@stonyx/utils/string';

console.log(pluralize('person')); // people
console.log(pluralize('box'));    // boxes
```

---

## Date Utils

### Functions

#### `getTimestamp(date?)`

Returns the UNIX timestamp (whole seconds since epoch) of `date`, or of now when no date is given.

```js
import { getTimestamp } from '@stonyx/utils/date';

console.log(getTimestamp()); // e.g., 1693564800
```

---

## Promise Utils

### Functions

#### `sleep(seconds)`

Delays execution for the given number of seconds.

```js
import { sleep } from '@stonyx/utils/promise';

await sleep(2); // waits 2 seconds
```

---

## Prompt Utils

Interactive CLI prompt helpers built on Node's `readline`.

### Functions

#### `confirm(question, options={})`

Prompts the user with `(y/N)` and resolves to `true` only if the answer is `"y"` (case-insensitive).

* `options.input` — Readable stream (default: `process.stdin`).
* `options.output` — Writable stream (default: `process.stdout`).

**TTY required:** Rejects with an error if `process.stdin` is not a TTY and no custom `input` stream is provided. For headless/container deployments, use `autoMigrate` config or provide a custom input stream.

#### `prompt(question, options={})`

Prompts the user with a question and resolves to the trimmed input string.

* `options.input` — Readable stream (default: `process.stdin`).
* `options.output` — Writable stream (default: `process.stdout`).

**TTY required:** Rejects with an error if `process.stdin` is not a TTY and no custom `input` stream is provided.

```js
import { confirm, prompt } from '@stonyx/utils/prompt';

const name = await prompt('What is your name?');
const ok = await confirm('Proceed?');
```

---

## Fuzzy Match

#### `new FuzzyMatch(options={})`

Matches names from two sources that spell them differently (accents, punctuation, case, stop words).

* `options.stopWords` — words removed before comparing (default `[]`).
* `options.delimiter` — separator between the two names in an entry's `name` (default `'\u00B7'`, `·`).
* `options.threshold` — minimum score `findBestMatch` accepts (default `0.35`). Both fall back with `||`, so a falsy value (`threshold: 0`, `delimiter: ''`) gets the default; pass `0` as `findBestMatch`'s `threshold` argument instead to accept any positive score.

Methods:

* `normalize(name)` — strips accents and punctuation, lowercases, removes stop words.
* `similarity(a, b)` — `1` for equal normalized names, `0.9` when one contains the other, otherwise word overlap from `0` to `1`: words of one character are ignored, an exact word counts `1` and a word that is a prefix of a word on the other side counts `0.7`, divided by the larger word count.
* `findBestMatch(nameA, nameB, entries, threshold?)` — best `{ entry, score }` among `entries` whose `name` is `"A<delimiter>B"`, matching either order, or `null` below the threshold.

```js
import FuzzyMatch from '@stonyx/utils/fuzzy-match';

const matcher = new FuzzyMatch({ stopWords: ['fc'] });
matcher.findBestMatch('Atletico Madrid', 'Real Madrid', [{ name: 'Real Madrid · Atlético Madrid' }]);
// { entry: { name: 'Real Madrid · Atlético Madrid' }, score: 1 }
```

---

## License

Apache — do what you want, just keep attribution.
