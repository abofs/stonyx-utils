# SME Template: Validation Loop Team — Stonyx Utils

> **Inherits from:** `beatrix-shared/docs/framework/templates/agents/validation-loop-team.md`
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

- Flat module architecture with 7 subpath exports: `file`, `object`, `string`, `date`, `promise`, `prompt`, `fuzzy-match`
- Each module exports named functions (no default exports) except `fuzzy-match` which exports a class as default
- File utils: async-first design wrapping `fs.promises` with error type narrowing via `isNodeError()` helper
- Atomic file updates: `updateFile()` writes to a temp file with timestamp suffix, then renames
- `forEachFileImport()` dynamically imports `.js` files from a directory with support for recursive traversal, name prefixing, and kebab-to-camelCase conversion
- Deep merge in `mergeObject()` uses shallow cloning for leaf values and recursive descent for nested objects, with an `ignoreNewKeys` guard
- `FuzzyMatch` class uses Unicode NFD normalization, configurable stop words, and Jaccard-style word-set overlap scoring with partial prefix matching (0.7 weight)

## Live Knowledge

- This is the most depended-upon package in the Stonyx ecosystem: changes cascade to 8 downstream repos via the `stonyx-workflows` cascade system
- Breaking changes to any exported function signature will propagate failures across the entire framework during cascade publishing
- The `get()` function uses `console.error` instead of throwing for invalid arguments -- a deliberate design choice for non-critical path usage
- `copyFile()` returns `false` (not throw) when target exists and `overwrite` is not set -- validate return value handling
- `fileExists()` catches all errors and returns `false`, not just ENOENT -- be aware this masks permission errors
- `prompt` and `confirm` accept injectable `input`/`output` streams, making them fully testable without TTY
- The `plurarize.ts` filename contains a known typo; the function is re-exported as `pluralize` from `string.ts`
- Test suite structure mirrors source: `test/unit/object/`, `test/unit/string/` subdirectories for category-specific tests
