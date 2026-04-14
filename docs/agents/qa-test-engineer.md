# SME Template: QA Test Engineer — Stonyx Utils

> **Inherits from:** `beatrix-shared/docs/framework/templates/agents/qa-test-engineer.md`
> Load the base template first, then layer this project-specific context on top.

## Project Context

**Repo:** `abofs/stonyx-utils`
**Framework:** Stonyx utility package published to npm as `@stonyx/utils`
**Domain:** Shared file, object, string, date, promise, prompt, and fuzzy-match helpers for the Stonyx ecosystem

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict, ESM) |
| Runtime | Node.js 24.x |
| Package Manager | pnpm 9 |
| Build | `tsc` (two configs: `tsconfig.json` for dist, `tsconfig.test.json` for dist-test) |
| Test Framework | QUnit |
| Test Doubles | Sinon (stubs for fs operations, readline, etc.) |
| Dependencies | Zero runtime dependencies (Node built-ins only) |
| CI | Reusable workflow from `abofs/stonyx-workflows` |
| Publishing | npm OIDC trusted publishing with alpha/beta/stable channels |

## Architecture Patterns

- Category-based module design: each source file (`file.ts`, `object.ts`, `string.ts`, `date.ts`, `promise.ts`, `prompt.ts`, `fuzzy-match.ts`) is a separate subpath export (e.g., `@stonyx/utils/file`, `@stonyx/utils/object`)
- No barrel/index file -- consumers import from specific subpaths, enabling tree-shaking
- File utils wrap `fs.promises` with atomic writes (temp file + rename in `updateFile`), recursive directory operations, and dynamic ESM imports via `forEachFileImport`
- Object utils provide deep clone (JSON round-trip), deep merge with `ignoreNewKeys` option, safe dot-path access via `get()`, and Map helper `getOrSet()`
- String utils include case converters (kebab/camel/pascal), random string generation, and English pluralization with irregular/uncountable noun handling
- `FuzzyMatch` class provides Unicode-normalized, stop-word-filtered, word-set similarity scoring for cross-source name reconciliation
- Prompt utils (`confirm`, `prompt`) wrap Node's `readline` with injectable streams for testability

## Live Knowledge

- Tests live in `test/unit/` with subdirectories mirroring the source structure (e.g., `test/unit/object/get-test.ts`, `test/unit/string/plurarize-test.ts`)
- The `pnpm test` script chains `build`, `build:test`, then runs QUnit on `dist-test/test/**/*.js`
- `forEachFileImport()` is heavily used across the Stonyx ecosystem for plugin/module loading; test both the `recursive` and `recursiveNaming` options
- `updateFile()` uses a timestamp-based temp file (`{path}.temp-{unix_ts}`) for atomic writes -- test concurrent write scenarios
- `mergeObject()` performs recursive deep merge but explicitly rejects arrays as top-level inputs
- `get()` uses `console.error` for argument validation failures rather than throwing, returning `undefined` -- tests must account for this behavior
- The `pluralize` function lives in `src/plurarize.ts` (note the typo in the filename) and is re-exported from `string.ts`
- This package is a foundational dependency: 8 downstream Stonyx repos depend on it (stonyx, stonyx-events, stonyx-cron, stonyx-rest-server, stonyx-oauth, stonyx-orm, stonyx-discord, stonyx-sockets)
