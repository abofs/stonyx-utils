# Project Structure

## Overview

`@stonyx/utils` is a utilities module for the Stonyx Framework. It provides pure JavaScript helper functions for file system operations, object manipulation, string transformations, date handling, promises, and interactive CLI prompts.

- **Package name:** `@stonyx/utils`
- **Version:** `0.2.3-beta.1`
- **License:** Apache-2.0
- **Module system:** ES Modules (`"type": "module"`)
- **Node version:** v24.13.0 (`.nvmrc`)
- **Package manager:** pnpm
- **Repository:** https://github.com/abofs/stonyx-utils.git

## Tech Stack

- **Runtime:** Node.js (ESM)
- **Test framework:** QUnit 2.x
- **Test mocking:** Sinon 21.x
- **CI/CD:** GitHub Actions (reusable workflows from `abofs/stonyx-workflows`)
- **Publishing:** npm (public, with provenance)

## File Structure

```
stonyx-utils/
  .claude/                        # Claude project memory
    project-structure.md          # This file
    improvements.md               # Known issues and improvement ideas
  .github/
    workflows/
      ci.yml                      # CI on PRs to dev/main (reusable workflow)
      publish.yml                 # NPM publish on push to main / manual dispatch
  src/
    date.js                       # Date utilities
    file.js                       # File system utilities
    object.js                     # Object/array utilities
    plurarize.js                  # Pluralization engine (NOTE: filename typo)
    promise.js                    # Promise utilities
    prompt.js                     # CLI prompt utilities
    string.js                     # String transformation utilities
  test/
    unit/
      file-test.js                # Tests for src/file.js
      prompt-test.js              # Tests for src/prompt.js
      object/
        get-test.js               # Tests for object get()
        getOrSet-test.js          # Tests for object getOrSet()
        object-test.js            # Tests for mergeObject()
      string/
        plurarize-test.js         # Tests for pluralize (NOTE: filename typo)
        string-test.js            # Tests for string conversion functions
  .gitignore
  .npmignore                      # Excludes test/ and .nvmrc from published package
  .nvmrc                          # Node v24.13.0
  LICENSE.md                      # Apache-2.0
  README.md
  package.json
  pnpm-lock.yaml
```

## Package Exports

Defined in `package.json` under `"exports"`:

| Import path            | File             |
| ---------------------- | ---------------- |
| `@stonyx/utils/date`   | `src/date.js`    |
| `@stonyx/utils/object` | `src/object.js`  |
| `@stonyx/utils/file`   | `src/file.js`    |
| `@stonyx/utils/promise`| `src/promise.js` |
| `@stonyx/utils/prompt` | `src/prompt.js`  |
| `@stonyx/utils/string` | `src/string.js`  |

## Module Documentation

### `src/date.js`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `getTimestamp` | `getTimestamp(dateObject?: Date): number` | Returns UNIX timestamp in seconds. If `dateObject` is provided, uses that date; otherwise uses `Date.now()`. |

### `src/file.js`

Imports: `@stonyx/utils/date`, `@stonyx/utils/string`, `@stonyx/utils/object`, `fs`, `path`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `createFile` | `createFile(filePath, data, options?): Promise<void>` | Creates a file. `options.json` serializes data as JSON. Auto-creates parent directories. |
| `updateFile` | `updateFile(filePath, data, options?): Promise<void>` | Atomically updates an existing file via temp-file swap. `options.json` for JSON serialization. Throws if file does not exist. |
| `copyFile` | `copyFile(sourcePath, targetPath, options?): Promise<boolean>` | Copies a file. Returns `false` if target exists and `options.overwrite` is not `true`. |
| `readFile` | `readFile(filePath, options?): Promise<string\|object>` | Reads a file. `options.json` parses as JSON. `options.missingFileCallback(filePath)` called on ENOENT. |
| `deleteFile` | `deleteFile(filePath, options?): Promise<void>` | Deletes a file. `options.ignoreAccessFailure` silences missing-file errors. |
| `deleteDirectory` | `deleteDirectory(dir): Promise<void>` | Recursively deletes a directory (`rm -rf`). |
| `createDirectory` | `createDirectory(dir): Promise<void>` | Recursively creates a directory (`mkdir -p`). |
| `forEachFileImport` | `forEachFileImport(dir, callback, options?): Promise<void>` | Dynamically imports all `.js` files in a directory and invokes `callback(exports, { name, stats, path })`. Options: `fullExport`, `rawName`, `ignoreAccessFailure`, `recursive`, `recursiveNaming`, `namePrefix`. |
| `fileExists` | `fileExists(filePath): Promise<boolean>` | Returns `true` if file exists, `false` otherwise. |

### `src/object.js`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `deepCopy` | `deepCopy(obj): any` | Deep clones via `JSON.parse(JSON.stringify())`. |
| `objToJson` | `objToJson(obj, format?): string` | Stringifies object with formatting (default: tab). |
| `makeArray` | `makeArray(obj): Array` | Wraps value in array if not already an array. |
| `mergeObject` | `mergeObject(obj1, obj2, options?): object` | Deep merges two objects. `options.ignoreNewKeys` skips keys not in `obj1`. Throws on array input. |
| `get` | `get(obj, path): any\|null` | Safely traverses dot-notation path. Returns `null` if any segment is `undefined`. Uses `console.error` for validation (does not throw). |
| `getOrSet` | `getOrSet(map, key, defaultValue): any` | Gets from a `Map`, or sets `defaultValue` (or calls it if function) when key is missing. Throws if not a `Map`. |

### `src/plurarize.js`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `default` (pluralize) | `pluralize(word): string` | Returns plural form of an English noun. Handles irregular nouns, uncountable nouns, and rule-based suffixes (s/x/ch/sh, y, f/fe, o, z). Preserves casing. |

### `src/promise.js`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `sleep` | `sleep(seconds): Promise<void>` | Async delay for the given number of seconds. |

### `src/prompt.js`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `confirm` | `confirm(question, options?): Promise<boolean>` | Prompts user with `(y/N)` and returns `true` only if input is `"y"` (case-insensitive). Options: `{ input, output }` for custom streams. |
| `prompt` | `prompt(question, options?): Promise<string>` | Prompts user with a question and returns trimmed input. Options: `{ input, output }` for custom streams. |

### `src/string.js`

Re-exports `pluralize` from `./plurarize.js`.

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `kebabCaseToCamelCase` | `kebabCaseToCamelCase(str): string` | Converts `kebab-case` to `camelCase`. |
| `kebabCaseToPascalCase` | `kebabCaseToPascalCase(str): string` | Converts `kebab-case` to `PascalCase`. |
| `camelCaseToKebabCase` | `camelCaseToKebabCase(str): string` | Converts `camelCase` to `kebab-case`. |
| `generateRandomString` | `generateRandomString(length?): string` | Generates random alphanumeric string (default length: 8). |
| `pluralize` | (re-export) | Re-exported from `./plurarize.js`. |

## Dependencies

### Runtime

None (`"dependencies": {}`).

### Dev

| Package | Version | Purpose |
| ------- | ------- | ------- |
| `qunit` | `^2.24.1` | Test framework |
| `sinon` | `^21.0.0` | Stubs/spies for tests |
| `fs` | `^0.0.1-security` | Placeholder (Node built-in) |

## Test Patterns

- **Framework:** QUnit with nested `module()` blocks
- **Mocking:** Sinon spies/stubs (used for `console.error` spying in `get-test.js`, stub factories in `getOrSet-test.js`)
- **Stream mocking:** Custom `Readable`/`Writable` streams in `prompt-test.js`
- **File tests:** Create temp directory in `beforeEach`, clean up in `afterEach`
- **Run command:** `pnpm test` (which runs `qunit`)
- **Import style:** Tests import from package exports (e.g., `@stonyx/utils/object`)

## CI/CD

- **CI workflow** (`ci.yml`): Runs on PRs to `dev` and `main` branches. Uses reusable workflow from `abofs/stonyx-workflows/.github/workflows/ci.yml@main`. Concurrency grouping cancels in-progress runs for the same branch.
- **Publish workflow** (`publish.yml`): Triggers on push to `main`, PR events, or manual dispatch. Supports `patch`/`minor`/`major` version bumps and custom version strings. Uses reusable workflow from `abofs/stonyx-workflows/.github/workflows/npm-publish.yml@main`. Requires `contents: write`, `id-token: write`, and `pull-requests: write` permissions.
- **Prepublish hook:** `npm test` runs before publish via `prepublishOnly` script.
