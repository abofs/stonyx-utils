# Project Structure

## Index

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [File Structure](#file-structure)
- [Canonical Usage Samples](#canonical-usage-samples)
- [Package Exports](#package-exports)
- [Module Documentation](#module-documentation)
  - [date.ts](#srcdatets)
  - [file.ts](#srcfilets)
    - [Swap file lifecycle](#swap-file-lifecycle)
  - [object.ts](#srcobjectts)
  - [plurarize.ts](#srcplurarizets)
  - [promise.ts](#srcpromisets)
  - [prompt.ts](#srcpromptts)
  - [string.ts](#srcstringts)
  - [fuzzy-match.ts](#srcfuzzy-matchts)
- [Downstream Consumers](#downstream-consumers)
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
  .claude/                        # Agent pointer only
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
    date.ts                       # Date utilities
    file.ts                       # File system utilities
    object.ts                     # Object/array utilities
    plurarize.ts                  # Pluralization engine (NOTE: filename typo)
    promise.ts                    # Promise utilities
    prompt.ts                     # CLI prompt utilities
    string.ts                     # String transformation utilities
    fuzzy-match.ts                # FuzzyMatch word-set name similarity (default export)
  test/
    sample/                       # Canonical usage samples (README link); run by unit/sample-test.ts, guarded by unit/sample-surface-test.ts
      date.ts                     # getTimestamp
      file.ts                     # every @stonyx/utils/file export, in a caller-supplied dir
      fuzzy-match.ts              # FuzzyMatch normalize/similarity/findBestMatch
      object.ts                   # deepCopy/objToJson/makeArray/mergeObject/get/getOrSet
      promise.ts                  # sleep
      prompt.ts                   # confirm/prompt with caller-supplied streams
      string.ts                   # case conversions, generateRandomString, pluralize
    unit/
      file-test.ts                # Tests for src/file.ts
      file-concurrency-test.ts    # updateFile concurrency + failure-path tests (#44)
      fuzzy-match-test.ts         # Tests for src/fuzzy-match.ts
      prompt-test.ts              # Tests for src/prompt.ts
      sample-test.ts              # Runs every sample in test/sample/ and asserts on what each call produced
      sample-surface-test.ts      # Fails if an export, sample, or import specifier falls outside the sample contract
      object/
        get-test.ts               # Tests for object get()
        getOrSet-test.ts          # Tests for object getOrSet()
        object-test.ts            # Tests for mergeObject()
      string/
        plurarize-test.ts         # Tests for pluralize (NOTE: filename typo)
        string-test.ts            # Tests for string conversion functions
  .gitignore
  .npmignore                      # Excludes test/ and .nvmrc from published package
  .nvmrc                          # Node v24.13.0
  LICENSE.md                      # Apache-2.0
  README.md
  package.json
  pnpm-lock.yaml
  tsconfig.json                   # Build: src/ -> dist/
  tsconfig.test.json              # Test build: -> dist-test/
```

## Canonical Usage Samples

`test/sample/` is the canonical usage reference, one file per `exports` subpath; the README links it by absolute GitHub URL because `test/` is not in the published tarball.

- Samples import `@stonyx/utils/<subpath>`, never `src/`, so they exercise the built `dist/` entries a consumer installs. Each sample exports functions only and has no top-level side effects; file samples take the directory to work in, and prompt samples take the `input`/`output` streams.
- `test/unit/sample-test.ts` runs every sample and asserts on what each call produced: file samples in a `mkdtemp` dir, prompts through stream mocks, `sleep` under fake timers, and `FuzzyMatch` methods through `FuzzyMatch.prototype` spies. It also imports every compiled sample in a fresh process and fails on any console or stdio output, and fails if a sample changes `git status`.
- `test/unit/sample-surface-test.ts` (copied unchanged from `@stonyx/events`) fails if a runtime export is not imported by any sample, if a sample is not imported by any `*-test.ts`, if a sample imports an unexported subpath of `@stonyx/utils` or a relative path outside `test/sample/`, or if an export subpath stops resolving to `dist/`. The export and sample coverage checks count only the imports left after TypeScript compiles the file, so `import type`, `import { type X }`, an unused import, and an import in a comment or string do not count toward them. It counts top-level exports, so `FuzzyMatch`'s methods are covered by `sample-test.ts`, not by this guard.
- `pnpm build:test`, which `pnpm test` runs, type-checks the samples, including the type imports they make. Nothing requires a sample to import each type-only export.
- The test glob is `dist-test/test/**/*-test.js`, so a sample only runs when a test imports it.
- Adding an export means adding it to a sample.

## Package Exports

Defined in `package.json` under `"exports"`. Each subpath resolves to the compiled `dist/<name>.js` (with `dist/<name>.d.ts` types); the source column is the file `tsc` builds it from.

| Import path            | Source           |
| ---------------------- | ---------------- |
| `@stonyx/utils/date`   | `src/date.ts`    |
| `@stonyx/utils/object` | `src/object.ts`  |
| `@stonyx/utils/file`   | `src/file.ts`    |
| `@stonyx/utils/promise`| `src/promise.ts` |
| `@stonyx/utils/prompt` | `src/prompt.ts`  |
| `@stonyx/utils/string` | `src/string.ts`  |
| `@stonyx/utils/fuzzy-match` | `src/fuzzy-match.ts` |

There is no root (`.`) export and no barrel file: consumers import each category from its subpath. Every subpath exports named functions except `fuzzy-match`, whose default export is the `FuzzyMatch` class.

## Module Documentation

### `src/date.ts`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `getTimestamp` | `getTimestamp(dateObject?: Date): number` | Returns UNIX timestamp in seconds. If `dateObject` is provided, uses that date; otherwise uses `Date.now()`. |

### `src/file.ts`

Imports: `@stonyx/utils/string`, `@stonyx/utils/object`, `fs`, `path`, `crypto`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `createFile` | `createFile(filePath, data, options?): Promise<void>` | Creates a file. `options.json` serializes data as JSON. Auto-creates parent directories. |
| `updateFile` | `updateFile(filePath, data, options?): Promise<void>` | Atomically updates an existing file via a sibling swap file named `{path}.temp-{pid}-{token}` (`token` is 8 base64url characters — 6 CSPRNG bytes, 48 bits — from `randomBytes()`; a full 36-char UUID pushed long basenames into `ENAMETOOLONG`), then `rename`. `options.json` for JSON serialization. Throws `ENOENT` if the file does not exist. Preserves the target's mode across the swap, applied to the open descriptor rather than to the swap path so it cannot be redirected by a symlink. **Concurrency: last writer wins.** Unique swap names make concurrent calls on one path safe — no rename-time `ENOENT`, no cross-caller byte clobber, and no orphan swap file left by any failure path `updateFile` controls (write failure, `chmod` failure, or rename failure) — but `updateFile` does not serialize, so the value that lands is whichever caller renames last. Callers needing a serialization guarantee must supply their own; an in-process queue would not provide one across processes. **Not covered:** cleanup after a failed `rename` is best effort, so a failing `unlink` leaves the swap file, and a process that dies between the write and the rename leaves a `{path}.temp-{pid}-{token}` sibling that nothing reclaims — see [Swap file lifecycle](#swap-file-lifecycle). |
| `copyFile` | `copyFile(sourcePath, targetPath, options?): Promise<boolean>` | Copies a file. Returns `false` if target exists and `options.overwrite` is not `true`. |
| `readFile` | `readFile(filePath, options?): Promise<string\|object>` | Reads a file. `options.json` parses as JSON. `options.missingFileCallback(filePath)` called on ENOENT. |
| `deleteFile` | `deleteFile(filePath, options?): Promise<void>` | Deletes a file. `options.ignoreAccessFailure` silences missing-file errors. |
| `deleteDirectory` | `deleteDirectory(dir): Promise<void>` | Recursively deletes a directory (`rm -rf`). |
| `createDirectory` | `createDirectory(dir): Promise<void>` | Recursively creates a directory (`mkdir -p`). |
| `forEachFileImport` | `forEachFileImport(dir, callback, options?): Promise<void>` | Dynamically imports all `.js` files in a directory and invokes `callback(exports, { name, stats, path })`. Options: `fullExport`, `rawName`, `ignoreAccessFailure`, `recursive`, `recursiveNaming`, `namePrefix`. |
| `fileExists` | `fileExists(filePath): Promise<boolean>` | Returns `true` if `fs.access` succeeds, `false` on **any** error, not only `ENOENT`. A permission error therefore reads as "does not exist". |

#### Swap file lifecycle

`updateFile` writes a sibling swap file and renames it over the target. The swap file must stay a sibling of the target: that keeps the `rename` on one filesystem, which is what makes it atomic. Which swap files can survive, and what reclaims them, is the part a consumer has to plan for.

| Situation | Swap file | Reclaimed by |
| --------- | --------- | ------------ |
| Success | Renamed onto the target | n/a |
| `writeFile` fails (ENOSPC, EDQUOT, EIO) | Unlinked | `updateFile` |
| `chmod` or `rename` fails | Unlinked | `updateFile` |
| Swap path unlinked and replaced with a symlink mid-write | The swap file's inode is still held open, so the write and the `chmod` land on it and not on the attacker's target; the `rename` then moves whatever occupies the path. The mode is never applied to a path. | n/a |
| `unlink` itself fails during that cleanup | **Left on disk** | nothing |
| `EEXIST` from the `wx` **open** | **Left on disk — deliberately.** The open lost a race, so the path was not created by this call and belongs to another writer. Unlinking it would reintroduce [#44](https://github.com/abofs/stonyx-utils/issues/44). | its owner |
| `EEXIST` from `rename` (Windows, some network filesystems) | Unlinked. The write stage already succeeded, so this swap file *is* ours — ownership is decided by which stage failed, not by the error code alone. | `updateFile` |
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

### `src/object.ts`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `deepCopy` | `deepCopy(obj): any` | Deep clones via `JSON.parse(JSON.stringify())`. |
| `objToJson` | `objToJson(obj, format?): string` | Stringifies object with formatting (default: tab). |
| `makeArray` | `makeArray(obj): Array` | Wraps value in array if not already an array. |
| `mergeObject` | `mergeObject(obj1, obj2, options?): object` | Deep merges two objects. `options.ignoreNewKeys` skips keys not in `obj1`. Throws on array input. |
| `get` | `get(obj, path): any\|undefined` | Traverses a dot-notation path. Returns `undefined` as soon as a segment is `undefined` (so a missing key or a primitive intermediate such as `get({a:1}, 'a.b')` gives `undefined`). Only `undefined` is guarded: a `null` intermediate segment throws a `TypeError` (`get({a:null}, 'a.b')`), and a `null` final value is returned as `null`. Invalid arguments (wrong arity, falsy `obj`, non-string `path`) log via `console.error` and return `undefined`. |
| `getOrSet` | `getOrSet(map, key, defaultValue): any` | Gets from a `Map`, or sets `defaultValue` (or calls it if function) when key is missing. Throws if not a `Map`. |

### `src/plurarize.ts`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `default` (pluralize) | `pluralize(word): string` | Returns plural form of an English noun. Handles irregular nouns, uncountable nouns, and rule-based suffixes (s/x/ch/sh, y, f/fe, o, z). Preserves casing. |

### `src/promise.ts`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `sleep` | `sleep(seconds): Promise<void>` | Async delay for the given number of seconds. |

### `src/prompt.ts`

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `confirm` | `confirm(question, options?): Promise<boolean>` | Prompts user with `(y/N)` and returns `true` only if input is `"y"` (case-insensitive). Options: `{ input, output }` for custom streams. Rejects if no TTY and no custom `input`. |
| `prompt` | `prompt(question, options?): Promise<string>` | Prompts user with a question and returns trimmed input. Options: `{ input, output }` for custom streams. Rejects if no TTY and no custom `input`. |

### `src/string.ts`

Re-exports `pluralize` from `./plurarize.js` (the compiled `src/plurarize.ts`).

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `kebabCaseToCamelCase` | `kebabCaseToCamelCase(str): string` | Converts `kebab-case` to `camelCase`. |
| `kebabCaseToPascalCase` | `kebabCaseToPascalCase(str): string` | Converts `kebab-case` to `PascalCase`. |
| `camelCaseToKebabCase` | `camelCaseToKebabCase(str): string` | Converts `camelCase` to `kebab-case`. |
| `generateRandomString` | `generateRandomString(length?): string` | Generates random alphanumeric string (default length: 8). |
| `pluralize` | (re-export) | Re-exported from `./plurarize.js`. |

### `src/fuzzy-match.ts`

Default export: `class FuzzyMatch`. Word-set similarity scoring for reconciling names that come from different sources.

| Member | Signature | Description |
| ------ | --------- | ----------- |
| `constructor` | `new FuzzyMatch({ stopWords?, delimiter?, threshold? })` | Defaults: `stopWords` `[]`, `delimiter` `'\u00B7'` (middle dot), `threshold` `0.35`. Each option falls back with `\|\|`, so a falsy value (`threshold: 0`, `delimiter: ''`) is replaced by the default. |
| `normalize` | `normalize(name): string` | NFD-normalizes and strips combining marks, lowercases, replaces non-alphanumerics with spaces, removes whole-word stop words, collapses whitespace. |
| `similarity` | `similarity(a, b): number` | `1.0` if the normalized strings are equal, `0.9` if one contains the other, `0` if either is empty. Otherwise word-set overlap (words of length > 1): an exact word counts 1, a word that is a prefix of the other side's word (either direction) counts 0.7; the sum is divided by the larger set's size. |
| `findBestMatch` | `findBestMatch(nameA, nameB, entries, threshold?): { entry, score } \| null` | Each `entry.name` is split on `delimiter` and must have exactly two parts (others are skipped). Scores the pair in both orders, keeps the best, and returns it only if `score >= threshold` (argument, else the instance default). |

## Downstream Consumers

Eight `@stonyx/*` packages depend on this one: `stonyx` and `stonyx-orm` at runtime; `stonyx-events`, `stonyx-cron`, `stonyx-rest-server`, `stonyx-oauth`, `stonyx-discord` and `stonyx-sockets` as dev dependencies. A publish of this package cascades a rebuild to them through the `stonyx-workflows` cascade job (`publish.yml` → `cascade.yml@main`), so a breaking change to any exported signature fails across the framework during the cascade. `forEachFileImport` is the directory loader in the `src/` of `stonyx-orm`, `stonyx-rest-server`, `stonyx-discord` and `stonyx-sockets`.

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
- **Mocking:** Sinon spies/stubs (used for `console.error` spying in `get-test.ts`, stub factories in `getOrSet-test.ts`)
- **Filesystem fault injection:** `sinon.stub(fsp, 'writeFile' | 'rename' | 'unlink')` in `file-concurrency-test.ts`. `dist/file.js` resolves these off the shared `fs.promises` object at call time, so stubbing the property intercepts production without a production seam. Always stub via sinon rather than assigning — `fs.promises` is process-global, QUnit runs one process, and the `sinon.restore()` in `afterEach` is what keeps a leaked patch from surfacing in an unrelated suite.
- **Clock pinning:** `sinon.useFakeTimers({ now, toFake: ['Date'] })` — `['Date']` only; faking timers as well deadlocks any test that awaits a barrier.
- **Stream mocking:** Custom `Readable`/`Writable` streams in `prompt-test.ts`
- **File tests:** Create temp directory in `beforeEach`, clean up in `afterEach`
- **Run command:** `pnpm test`, which runs `build` (`tsc`), then `build:test` (`tsc -p tsconfig.test.json`), then QUnit on `dist-test/test/**/*-test.js`. Only `*-test` files are run as tests, so samples under `test/sample/` load only when a test imports them. Tests run from compiled output, so a `src/` change is only exercised after the build step
- **Import style:** Tests import from package exports (e.g., `@stonyx/utils/object`)

## CI/CD

- **CI workflow** (`ci.yml`): Runs on PRs to `dev` and `main` branches. Uses reusable workflow from `abofs/stonyx-workflows/.github/workflows/ci.yml@main`. Concurrency grouping cancels in-progress runs for the same branch.
- **Publish workflow** (`publish.yml`): Triggers on push to `main`, PR events, or manual dispatch. Supports `patch`/`minor`/`major` version bumps and custom version strings. Uses reusable workflow from `abofs/stonyx-workflows/.github/workflows/npm-publish.yml@main`. Requires `contents: write`, `id-token: write`, and `pull-requests: write` permissions.
- **Prepublish hook:** `npm test` runs before publish via `prepublishOnly` script.
