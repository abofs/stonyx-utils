# stonyx-utils

Utilities module for the Stonyx Framework. Provides helpers for files, objects, strings, dates, and promises.

---

## Quick Reference Table

| Category    | Function                | Description                                              |
| ----------- | ----------------------- | -------------------------------------------------------- |
| **File**    | `createFile`            | Create a file (supports JSON serialization).             |
|             | `updateFile`            | Atomically update a file.                                |
|             | `copyFile`              | Copy a file, with optional overwrite.                    |
|             | `readFile`              | Read a file (JSON optional), with missing file callback. |
|             | `deleteFile`            | Delete a file (ignore missing optional).                 |
|             | `deleteDirectory`       | Recursively delete a directory.                          |
|             | `createDirectory`       | Recursively create a directory.                          |
|             | `forEachFileImport`     | Dynamically import all JS files in a directory.          |
|             | `fileExists`            | Check if a file exists.                                  |
| **Object**  | `deepCopy`              | Deep clone an object or array.                           |
|             | `objToJson`             | Convert object to formatted JSON string.                 |
|             | `makeArray`             | Wrap a value in an array.                                |
|             | `mergeObject`           | Deep merge two objects (ignore new keys optional).       |
|             | `get`                   | Get nested property safely via dot path.                 |
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

---

## Table of Contents

* [Installation](#installation)
* [Running the Test Suite](#running-the-test-suite)
* [File Utils](#file-utils)
* [Object Utils](#object-utils)
* [String Utils](#string-utils)
* [Date Utils](#date-utils)
* [Promise Utils](#promise-utils)
* [Prompt Utils](#prompt-utils)
* [License](#license)

---

## Installation

```bash
npm install @stonyx/utils
```

---

## File Utils

The File utils wrap the `path` and `fs` libraries to manipulate the local file system asynchronously with full async/await support. Includes creation, reading, updating, copying, deleting files and directories, checking existence, and dynamic importing via `forEachFileImport`.

### Functions

#### `createFile(filePath, data, options={})`

Creates a file at the given path.

* `options.json` — boolean, if true, data will be serialized to JSON.

#### `updateFile(filePath, data, options={})`

Updates a file atomically by writing to a temporary file first.

* `options.json` — boolean, serialize as JSON.

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

Safely gets a nested property using dot notation. Returns `null` if path not found.

#### `getOrSet(map, key, defaultValue)`

Gets the value for a key in a `Map`, or sets it to `defaultValue` if missing.

---

## String Utils

### Functions

#### `kebabCaseToCamelCase(str)`

Converts `'my-string'` → `'myString'`.

#### `kebabCaseToPascalCase(str)`

Converts `'my-string'` → `'MyString'`.

#### `generateRandomString(length=8)`

Generates a random alphanumeric string.

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

#### `getTimestamp()`

Returns the current UNIX timestamp (seconds since epoch).

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

#### `prompt(question, options={})`

Prompts the user with a question and resolves to the trimmed input string.

* `options.input` — Readable stream (default: `process.stdin`).
* `options.output` — Writable stream (default: `process.stdout`).

```js
import { confirm, prompt } from '@stonyx/utils/prompt';

const name = await prompt('What is your name?');
const ok = await confirm('Proceed?');
```

---

## License

Apache — do what you want, just keep attribution.
