# @stonyx/utils architecture

`@stonyx/utils` is a utilities module for the Stonyx Framework: general-purpose helpers for files,
objects, strings, dates, promises, and interactive CLI prompts, plus a word-set name-similarity
matcher. There is no root (`.`) export and no barrel file — each area below is its own
`package.json#exports` subpath, built from one `src/*.ts` file to one `dist/*.js` file. See
[docs/project-structure.md](project-structure.md) for the full file layout, exports table, and
module-by-module API reference.

## Canonical usage reference

[`test/sample/`](../test/sample/) is the canonical, test-exercised usage reference for every
export — one sample file per `exports` subpath, importing `@stonyx/utils/<subpath>` exactly as a
consumer would. `test/unit/sample-test.ts` runs every sample and asserts on its output;
`test/unit/sample-surface-test.ts` fails the build if an export has no sample, a sample has no
test, or a sample imports something a consumer couldn't. Start there, not in `src/`, for working
examples — see [project-structure.md#canonical-usage-samples](project-structure.md#canonical-usage-samples)
for how the guard works.

## Areas

Grouped by `src/` layout and by `package.json#exports` subpath — seven areas, not six: the exports
map also has a `fuzzy-match` subpath alongside the five conventional helper categories and
`prompt`.

### File helpers

`@stonyx/utils/file` (`src/file.ts`) wraps `fs`/`fs.promises`, `path`, and `crypto` for
async file and directory operations: `createFile`, `updateFile` (atomic, swap-file-based),
`copyFile`, `readFile`, `deleteFile`, `deleteFileSync`, `deleteDirectory`, `createDirectory`,
`createReadStream`, `createWriteStream`, `forEachFileImport`, and `fileExists`. `updateFile`'s
atomicity and swap-file lifecycle (including what is and isn't reclaimed after a crash) is
non-trivial and already written up in detail — see
[project-structure.md#srcfilets](project-structure.md#srcfilets) and its
[Swap file lifecycle](project-structure.md#swap-file-lifecycle) subsection rather than
re-explaining it here.

### Object helpers

`@stonyx/utils/object` (`src/object.ts`): `deepCopy`, `objToJson`, `makeArray`, `mergeObject`
(deep merge with an `ignoreNewKeys` option), `get` (dot-path traversal, `undefined`-only guarded —
a `null` intermediate throws), and `getOrSet` (get-or-populate on a `Map`). See
[project-structure.md#srcobjectts](project-structure.md#srcobjectts) for exact signatures and the
`get`/`null` edge case.

### String helpers

`@stonyx/utils/string` (`src/string.ts`): case conversions (`kebabCaseToCamelCase`,
`kebabCaseToPascalCase`, `camelCaseToKebabCase`), `generateRandomString` (`Math.random`-based —
not cryptographically secure), and a re-exported `pluralize`. The pluralization engine itself
lives in a separate source file, `src/plurarize.ts` (filename typo, kept as-is), which `string.ts`
re-exports rather than implements — `src/` genuinely has eight files behind seven exports subpaths
for this reason. See [project-structure.md#srcstringts](project-structure.md#srcstringts) and
[project-structure.md#srcplurarizets](project-structure.md#srcplurarizets).

### Date helpers

`@stonyx/utils/date` (`src/date.ts`): a single function, `getTimestamp(dateObject?)`, returning a
UNIX timestamp in whole seconds. See
[project-structure.md#srcdatets](project-structure.md#srcdatets).

### Promise helpers

`@stonyx/utils/promise` (`src/promise.ts`): a single function, `sleep(seconds)`. See
[project-structure.md#srcpromisets](project-structure.md#srcpromisets).

### CLI prompt helpers

`@stonyx/utils/prompt` (`src/prompt.ts`): `confirm` and `prompt`, built on Node's `readline`, both
accepting custom `input`/`output` streams and rejecting when run against a non-TTY with no custom
stream supplied. See [project-structure.md#srcpromptts](project-structure.md#srcpromptts).

### Fuzzy name matching

`@stonyx/utils/fuzzy-match` (`src/fuzzy-match.ts`): the only subpath with a default export rather
than named exports — the `FuzzyMatch` class, for reconciling names that come from different
sources (accents, punctuation, case, stop words). See
[project-structure.md#srcfuzzy-matchts](project-structure.md#srcfuzzy-matchts).

## Build, Run, Test

Verified in this repo on Node v24.13.0 / pnpm 10.23.0:

```sh
pnpm install --frozen-lockfile   # installs cleanly against the committed lockfile
pnpm test                        # 145 tests, all passing
```

- There is no separate `lint` script in this package (unlike `@stonyx/logs`).
- `pnpm test` itself resolves to `pnpm build && pnpm build:test && qunit 'dist-test/test/**/*-test.js'`:
  it builds `src/` to `dist/` (`tsc`), builds the test tree to `dist-test/`
  (`tsc -p tsconfig.test.json`), and only then runs QUnit against the compiled output. A `src/`
  change is only exercised by `pnpm test` after that build step, and tests import from the
  package's own `exports` subpaths (e.g. `@stonyx/utils/object`), not from `src/` — so a sample or
  test exercises exactly what a consumer would get.

## Delivery

`@stonyx/utils` is published to npm (`@stonyx/utils`) and consumed as a library dependency inside
a Node.js backend. It has no web, iOS, or Android surface of its own. Eight `@stonyx/*` packages
depend on it (two at runtime, six as dev dependencies) — see
[project-structure.md#downstream-consumers](project-structure.md#downstream-consumers) — so a
breaking change to any exported signature here is felt across the framework on the next cascade
publish.

## Dependencies

**Runtime: none.** `package.json#dependencies` is `{}`. Every helper here is built on Node
built-ins (`fs`, `path`, `crypto`, `readline`) and plain JavaScript.

**Dev:** `qunit` (test framework), `sinon` (stubs/spies, used for filesystem fault injection and
clock pinning in the file and object tests), `typescript`, `@types/node`, `@types/qunit`,
`@types/sinon` — plus one that doesn't belong in that list:

- `fs` (`^0.0.1-security`) is declared as a devDependency, but **it is not a real package.** It
  resolves to npm's own ["security holder"](https://github.com/npm/security-holder) placeholder —
  the name `fs` is reserved by npm precisely so nobody can publish a malicious package under a
  core module's name, and the placeholder's own description says as much ("This package name is
  not currently in use... to avoid malicious use, npm is hanging on to the package name"). It has
  no functional code.
  Checked whether anything in this repo actually resolves to it: every `import ... from 'fs'` in
  `src/file.ts` and the test suite imports the bare specifier `'fs'` (or `'node:fs'`), and Node's
  module resolver always resolves a core-module name to the built-in before it would ever look in
  `node_modules` — a package in `node_modules` cannot shadow a core module under its own name. So
  this devDependency is installed (confirmed: `pnpm install --frozen-lockfile` does pull
  `fs@0.0.1-security` into `node_modules`) but **never actually used** by anything that imports
  `fs` by its bare name. It is inert cruft, present in `package.json` since this repo's first
  commit with no explanatory history, not a shim or polyfill for anything this package does.

## Further reading

- [README](../README.md) — install, quick-reference table, full per-function API docs
- [Project structure](project-structure.md) — file layout, exports table, module docs, test
  patterns, CI/CD
- [Release process](release.md)
