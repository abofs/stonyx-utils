# Release Process

This package follows the shared Stonyx release pipeline implemented in
[abofs/stonyx-workflows](https://github.com/abofs/stonyx-workflows). This repo's own
`.github/workflows/*.yml` files are thin wrappers that `uses:` the reusable workflows defined
there (`ci.yml`, `npm-publish.yml`, `cascade.yml`, `security-audit.yml`); the actual job steps
live in the shared repo, not here. What follows is verified against this repo's three workflow
files (`.github/workflows/ci.yml`, `publish.yml`, `security-audit.yml`), `package.json`'s
`prepublishOnly` script, and a read-only look at the shared workflows' current content — not
copied from the shared repo's own docs, and not copied from this repo's
[docs/project-structure.md#cicd](project-structure.md#cicd) section without re-checking it (see
Discrepancies below). **Infrastructure specifics — secrets, OIDC/token handling, branch
protection — are out of scope for this document**; see
[stonyx-workflows/docs/release.md](https://github.com/abofs/stonyx-workflows/blob/main/docs/release.md)
for those.

**npm package:** `@stonyx/utils`

## 1. CI (`.github/workflows/ci.yml`)

Runs on PRs targeting `dev`, `main`, or any `fix/**` branch. The reusable job:

1. Checks out the code.
2. `pnpm install --frozen-lockfile`
3. `pnpm test` (which itself runs `pnpm build` then `pnpm build:test` then QUnit — see
   [docs/index.md#build-run-test](index.md#build-run-test))
4. `pnpm run --if-present build` (redundant here since `pnpm test` already built, but still runs)
5. A docs-import check that verifies every `@stonyx/*` import shown in this repo's `README.md` /
   `docs/**/*.md` resolves against a real published (or locally built) export.

This matches what `pnpm install --frozen-lockfile && pnpm test` verified locally in this task:
install was clean against the committed lockfile, and all 145 tests passed. There is no `lint`
script in this package and CI does not run one.

## 2. Publish (`.github/workflows/publish.yml`)

Triggers, as declared in this repo's `publish.yml`:

- `repository_dispatch` (`cascade-publish`) — triggered by an upstream Stonyx package's own
  publish, to cascade a dependency bump into this package. (This package has no `@stonyx/*`
  runtime or dev dependencies of its own, so in practice nothing publishes *to* it this way today
  — see [docs/index.md#dependencies](index.md#dependencies).)
- `workflow_dispatch` — manual run with a `version-type` (`patch`/`minor`/`major`) or a
  `custom-version`.
- `pull_request` (`opened`, `synchronize`, `reopened`) targeting `dev` or `main` — i.e. **opening
  or pushing to a PR into `dev` or `main` triggers a publish run**, not just CI.
- `push` to `dev` or `main`.

The reusable `npm-publish.yml` job picks a version channel from the triggering event (in this
order): a cascade dispatch publishes beta; a `pull_request` event publishes alpha; a push to
`main` publishes stable; any other push (i.e. to `dev`) publishes beta. This means:

- Opening/updating a PR into `dev` → **alpha** publish, commented back onto the PR.
- Merging into `dev` (a push to `dev`) → **beta** publish.
- Merging `dev` into `main` (a push to `main`) → **stable** publish.

`prepublishOnly` here is `npm test` (not `npm run build && npm test` as in `@stonyx/logs` — this
package's own `test` script already runs `build` first, so the net effect is the same: build then
test). It is **not** run by `pnpm publish`/`npm publish` directly — `pnpm pack` (which the reusable
workflow uses to build the release artifact) runs `prepack`/`prepare`, not `prepublishOnly`. The
reusable workflow accounts for this: it explicitly checks whether `prepublishOnly` is declared and
runs it itself immediately before packing.

A successful publish also dispatches to downstream dependents via the reusable `cascade.yml` job.
Eight `@stonyx/*` packages depend on `@stonyx/utils` (see
[docs/project-structure.md#downstream-consumers](project-structure.md#downstream-consumers)), so
this package is a cascade *source* far more often than a cascade *target*.

## 3. Security audit (`.github/workflows/security-audit.yml`)

Runs on a daily cron (`0 8 * * *`) and on manual `workflow_dispatch`. The reusable job installs
with `pnpm install --frozen-lockfile` and runs `pnpm audit --audit-level moderate` with
`continue-on-error: true` — a finding is surfaced in the job log but does not fail the run or
block anything.

## Discrepancies found against docs/project-structure.md

`docs/project-structure.md`'s existing "CI/CD" section predates this document and is incomplete
rather than wrong — re-checked here against the actual `publish.yml`:

- It describes the publish workflow as triggering "on push to `main`, PR events, or manual
  dispatch." It does not mention that `push` also covers `dev` (so pushes to `dev`, not just
  `main`, publish — as beta), and it does not mention the `repository_dispatch` (`cascade-publish`)
  trigger at all. Both are present in `.github/workflows/publish.yml` as read for this document.
- It does not state the alpha/beta/stable channel-selection logic (which event maps to which
  channel); this document adds that above.

This document's own publish-trigger and channel-selection description takes priority going
forward; `project-structure.md` has not been edited to match as part of this change.

## What this document could not verify from this repo alone

- The exact mechanics of OIDC/npm-token handling, the release-artifact `.git`-content guard, and
  branch-protection rules on `dev`/`main` are implemented in `abofs/stonyx-workflows` and are
  deliberately not reproduced here (see the infra note above).
- Whether `dev`/`main` currently have branch protection rules configured is not something this
  repo's files can confirm or deny.
