# Project Structure

## Index

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [File Structure](#file-structure)
- [Package Exports](#package-exports)
- [Module Documentation](#module-documentation)
  - [date.js](#srcdate.js)
  - [file.js](#srcfile.js)
    - [Swap file lifecycle](#swap-file-lifecycle)
  - [object.js](#srcobject.js)
  - [plurarize.js](#srcplurarize.js)
  - [promise.js](#srcpromise.js)
  - [prompt.js](#srcprompt.js)
  - [string.js](#srcstring.js)
- [Dependencies](#dependencies)
- [Test Patterns](#test-patterns)
- [CI/CD](#cicd)

---

## Overview

`@stonyx/utils` is a utilities module for the Stonyx Framework. It provides helper functions for file system operations, object manipulation, string transformations, date handling, promises, and interactive CLI prompts.

- **Package name:** `@stonyx/utils`
- **Version:** see `package.json`
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
    CLAUDE.md                     # Agent entry point
  docs/                           # Human-facing documentation
    index.md                      # Documentation entry point
    project-structure.md          # This file
    release.md                    # Release instructions
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
      file-concurrency-test.js    # updateFile concurrency + failure-path tests (#44)
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

Imports: `@stonyx/utils/string`, `@stonyx/utils/object`, `fs`, `path`, `crypto`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `createFile` | `createFile(filePath, data, options?): Promise<void>` | Creates a file. `options.json` serializes data as JSON. Auto-creates parent directories. |
| `updateFile` | `updateFile(filePath, data, options?): Promise<void>` | Atomically updates an existing file via a sibling swap file named `{path}.temp-{pid}-{token}` (`token` is 8 hex chars from `randomUUID()`; the full 36-char form pushed long basenames into `ENAMETOOLONG`), then `rename`. `options.json` for JSON serialization. Throws `ENOENT` if the file does not exist. Preserves the target's mode across the swap. **Concurrency: last writer wins.** Unique swap names make concurrent calls on one path safe — no rename-time `ENOENT`, no cross-caller byte clobber, and no orphan swap file left by any failure path `updateFile` controls (write failure, `chmod` failure, or rename failure) — but `updateFile` does not serialize, so the value that lands is whichever caller renames last. Callers needing a serialization guarantee must supply their own; an in-process queue would not provide one across processes. **Not covered:** cleanup after a failed `rename` is best effort, so a failing `unlink` leaves the swap file, and a process that dies between the write and the rename leaves a `{path}.temp-{pid}-{token}` sibling that nothing reclaims — see [Swap file lifecycle](#swap-file-lifecycle). |
| `copyFile` | `copyFile(sourcePath, targetPath, options?): Promise<boolean>` | Copies a file. Returns `false` if target exists and `options.overwrite` is not `true`. |
| `readFile` | `readFile(filePath, options?): Promise<string\|object>` | Reads a file. `options.json` parses as JSON. `options.missingFileCallback(filePath)` called on ENOENT. |
| `deleteFile` | `deleteFile(filePath, options?): Promise<void>` | Deletes a file. `options.ignoreAccessFailure` silences missing-file errors. |
| `deleteDirectory` | `deleteDirectory(dir): Promise<void>` | Recursively deletes a directory (`rm -rf`). |
| `createDirectory` | `createDirectory(dir): Promise<void>` | Recursively creates a directory (`mkdir -p`). |
| `forEachFileImport` | `forEachFileImport(dir, callback, options?): Promise<void>` | Dynamically imports all `.js` files in a directory and invokes `callback(exports, { name, stats, path })`. Options: `fullExport`, `rawName`, `ignoreAccessFailure`, `recursive`, `recursiveNaming`, `namePrefix`. |
| `fileExists` | `fileExists(filePath): Promise<boolean>` | Returns `true` if file exists, `false` otherwise. |

#### Swap file lifecycle

`updateFile` writes a sibling swap file and renames it over the target. Which swap files can survive, and what reclaims them, is the part a consumer has to plan for.

| Situation | Swap file | Reclaimed by |
| --------- | --------- | ------------ |
| Success | Renamed onto the target | n/a |
| `writeFile` fails (ENOSPC, EDQUOT, EIO) | Unlinked | `updateFile` |
| `chmod` or `rename` fails | Unlinked | `updateFile` |
| `unlink` itself fails during that cleanup | **Left on disk** | nothing |
| `EEXIST` from the `wx` flag | **Left on disk — deliberately.** The path was not created by this call, so it belongs to another writer. Unlinking it would reintroduce [#44](https://github.com/abofs/stonyx-utils/issues/44). | its owner |
| Process killed between write and rename | **Left on disk** | nothing |

**The trade-off, stated plainly — and measured, because the obvious framing overstates it.** Before [#44](https://github.com/abofs/stonyx-utils/issues/44) the swap name was `{path}.temp-{unix_seconds}`, written with the default `w` flag. Two abandoned swap files on one path could therefore collapse into one, but *only* if both were abandoned inside the same whole second. That is a **rate limit, not a bound**: the old name reclaimed nothing across a second boundary, so a long-lived process still accumulated one orphan per crashing second, without limit.

Measured by killing a writer between the write and the rename, five crashes on one path:

| Crash cadence | old `temp-{unix_seconds}` | new `temp-{pid}-{token}` |
| ------------- | ------------------------- | ------------------------ |
| 1 crash / 1200 ms (ordinary) | 5 orphans | 5 orphans |
| 1 crash / 300 ms (restart storm) | 3 orphans | 5 orphans |
| back-to-back (hard crash loop) | 1 orphan | 5 orphans |

At any crash cadence slower than one per second — the ordinary case — the two names behave **identically**, and the old one reclaimed nothing the new one does not. The accumulation uniqueness genuinely adds is confined to a sub-second crash loop. Reuse is precisely the collision that corrupted concurrent saves, so it had to go, and the incidental same-second reclamation went with it. Every abandoned swap file is now a permanently distinct file, and **no sweeper ships with this module**; reclamation is tracked in [#47](https://github.com/abofs/stonyx-utils/issues/47).

That is the right trade (correctness over tidiness) and the residual is disk growth, not breakage: nothing in the `@stonyx/*` ecosystem enumerates these files. `@stonyx/orm` opens collections by explicit `{key}.json` path rather than reading the directory, and `forEachFileImport` filters on `.js`/`.ts`. The cost lands on consumers whose data directory is scanned by something outside the framework — an app that runs `git add` over its database directory will commit an orphan, since no `.gitignore` in this ecosystem carries a `*.temp-*` pattern. Sweeping or ignoring `*.temp-*` siblings of a target is safe and is the consumer's call to make.

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
| `confirm` | `confirm(question, options?): Promise<boolean>` | Prompts user with `(y/N)` and returns `true` only if input is `"y"` (case-insensitive). Options: `{ input, output }` for custom streams. Rejects if no TTY and no custom `input`. |
| `prompt` | `prompt(question, options?): Promise<string>` | Prompts user with a question and returns trimmed input. Options: `{ input, output }` for custom streams. Rejects if no TTY and no custom `input`. |

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
- **Filesystem fault injection:** `sinon.stub(fsp, 'writeFile' | 'rename' | 'unlink')` in `file-concurrency-test.js`. `dist/file.js` resolves these off the shared `fs.promises` object at call time, so stubbing the property intercepts production without a production seam. Always stub via sinon rather than assigning — `fs.promises` is process-global, QUnit runs one process, and the `sinon.restore()` in `afterEach` is what keeps a leaked patch from surfacing in an unrelated suite.
- **Clock pinning:** `sinon.useFakeTimers({ now, toFake: ['Date'] })` — `['Date']` only; faking timers as well deadlocks any test that awaits a barrier.
- **Stream mocking:** Custom `Readable`/`Writable` streams in `prompt-test.js`
- **File tests:** Create temp directory in `beforeEach`, clean up in `afterEach`
- **Run command:** `pnpm test` (which runs `qunit`)
- **Import style:** Tests import from package exports (e.g., `@stonyx/utils/object`)

## CI/CD

- **CI workflow** (`ci.yml`): Runs on PRs to `dev` and `main` branches. Uses reusable workflow from `abofs/stonyx-workflows/.github/workflows/ci.yml@main`. Concurrency grouping cancels in-progress runs for the same branch.
- **Publish workflow** (`publish.yml`): Triggers on push to `main`, PR events, or manual dispatch. Supports `patch`/`minor`/`major` version bumps and custom version strings. Uses reusable workflow from `abofs/stonyx-workflows/.github/workflows/npm-publish.yml@main`. Requires `contents: write`, `id-token: write`, and `pull-requests: write` permissions.
- **Prepublish hook:** `npm test` runs before publish via `prepublishOnly` script.
