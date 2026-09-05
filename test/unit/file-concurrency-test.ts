/**
 * Concurrency and failure-path coverage for `updateFile` — abofs/stonyx-utils#44.
 *
 * `updateFile` named its swap file `${filePath}.temp-${getTimestamp()}`, a
 * whole-second token. Two overlapping calls on one path inside one second
 * therefore computed the *same* swap name: writer B overwrote writer A's swap
 * bytes, A's rename moved B's payload under A's name, and B's rename threw
 * ENOENT.
 *
 * ACs are numbered per the 2026-09-04 refinement comment on the issue. The
 * modules below AC7 cover the SME findings raised on PR #45: the write-failure
 * orphan, the `wx` flag itself, swap-name length, and mode preservation.
 *
 * No production seam is added for testability (AC3(a) was struck). The two
 * test-only mechanisms are:
 *   1. `sinon.useFakeTimers({ toFake: ['Date'] })` — pins `Date.now()`, so
 *      `getTimestamp()` cannot straddle a second boundary and accidentally
 *      hand the two writers distinct names.
 *   2. `sinon.stub(fsp, 'open')` etc. `dist/file.js` resolves `fsp.open` at call
 *      time, so stubbing that property holds every writer at the point where
 *      its swap name is already computed but the swap file does not yet exist.
 *      The seam is `open` and not `writeFile` because the swap file is now
 *      created by `fsp.open(swapFile, 'wx', mode)` and everything after that
 *      addresses the descriptor — see the fchmod note in `src/file.ts`. Node's
 *      `fsp.writeFile` opens through an internal binding rather than through
 *      this property, so this stub intercepts `updateFile`'s swap open and
 *      nothing else. Stubs go through sinon rather than hand-assignment so the
 *      `sinon.restore()` in `afterEach` actually owns them — `fs.promises` is a
 *      process-global object and QUnit runs every test file in one process, so
 *      a leaked patch would surface in an unrelated suite.
 */
import QUnit from 'qunit';
import sinon from 'sinon';
import path from 'path';
import { promises as fsp } from 'fs';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';
import { createFile, updateFile, createDirectory, deleteDirectory } from '@stonyx/utils/file';

const { module, test } = QUnit;

const TMP_DIR: string = path.resolve('./__tmp_concurrency__');
const TMP_FILE: string = path.join(TMP_DIR, 'race.txt');
const DIST_FILE_URL: string = pathToFileURL(path.resolve('./dist/file.js')).href;

/** Fixed instant so `getTimestamp()` returns the same whole second on every call. */
const PINNED_NOW = 1756800000000;

/* ------------------------------------------------------------------ *
 * test-only instrumentation
 * ------------------------------------------------------------------ */

interface Barrier {
  /** How many writers have reached the swap-file `open` and been held. */
  entered: number;
  /** Every path passed to `fsp.open` while the barrier was installed. */
  paths: string[];
  restore: () => void;
}

/**
 * Hold every swap-file `open` caller until `expected` of them have entered.
 *
 * Each writer's swap name is computed *before* its `open` call, so by the time
 * the barrier releases both names are already fixed. Pre-fix they are the same
 * string; the barrier makes the resulting clobber deterministic instead of
 * dependent on scheduler luck. Holding at `open` rather than at `writeFile`
 * holds them one step earlier — before either has created its swap file — which
 * is a strictly tighter interleaving for the same assertions.
 */
function installOpenBarrier(expected: number): Barrier {
  const realOpen = fsp.open;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });

  const barrier: Barrier = {
    entered: 0,
    paths: [],
    restore: () => { stub.restore(); release(); },
  };

  const stub = sinon.stub(fsp, 'open').callsFake(async (file, flags, mode) => {
    barrier.entered += 1;
    barrier.paths.push(String(file));

    if (barrier.entered >= expected) release();

    // Fail-safe: never hang the suite if a writer dies before reaching the gate.
    await Promise.race([gate, new Promise<void>(r => setTimeout(r, 5000))]);

    return realOpen(file, flags, mode);
  });

  return barrier;
}

/** Record every path handed to `fsp.open` without altering its behaviour. */
function recordSwapPaths(): { paths: string[]; restore: () => void } {
  const realOpen = fsp.open;
  const paths: string[] = [];

  const stub = sinon.stub(fsp, 'open').callsFake(async (file, flags, mode) => {
    paths.push(String(file));

    return realOpen(file, flags, mode);
  });

  return { paths, restore: () => stub.restore() };
}

/** Tight-loop reader used to catch a torn (truncated) intermediate state. */
function startPoller(filePath: string): { observed: Set<string>; stop: () => Promise<void> } {
  const observed = new Set<string>();
  let running = true;

  const loop = (async () => {
    while (running) {
      try {
        observed.add(await fsp.readFile(filePath, 'utf8'));
      } catch (error) {
        observed.add(`<throw:${(error as NodeJS.ErrnoException).code ?? 'unknown'}>`);
      }
    }
  })();

  return { observed, stop: async () => { running = false; await loop; } };
}

async function swapFilesIn(dir: string): Promise<string[]> {
  return (await fsp.readdir(dir)).filter(name => name.includes('.temp-'));
}

async function modeOf(filePath: string): Promise<number> {
  return (await fsp.stat(filePath)).mode & 0o7777;
}

/* ------------------------------------------------------------------ */

module('[Unit] File — updateFile concurrency (#44)', function(hooks) {
  hooks.beforeEach(async () => {
    await deleteDirectory(TMP_DIR).catch(() => {});
    await createDirectory(TMP_DIR);
  });

  hooks.afterEach(async () => {
    sinon.restore();
    await deleteDirectory(TMP_DIR).catch(() => {});
  });

  module('AC1/AC3/AC7 — concurrent saves', function() {
    test('both callers resolve, the file holds exactly one whole payload, and no reader sees a torn value', async function(assert) {
      const ITERATIONS = 50;
      const clock = sinon.useFakeTimers({ now: PINNED_NOW, toFake: ['Date'] });

      let fulfilledRuns = 0;
      let barrierEntriesTotal = 0;
      const finalValues: string[] = [];
      const observedByPoller = new Set<string>();
      const rejections: string[] = [];

      try {
        for (let i = 0; i < ITERATIONS; i += 1) {
          await createFile(TMP_FILE, 'initial');

          const poller = startPoller(TMP_FILE);
          const barrier = installOpenBarrier(2);

          let results: PromiseSettledResult<void>[];
          try {
            results = await Promise.allSettled([
              updateFile(TMP_FILE, 'AAAA'),
              updateFile(TMP_FILE, 'BBBB'),
            ]);
          } finally {
            barrier.restore();
            await poller.stop();
          }

          barrierEntriesTotal += barrier.entered;
          poller.observed.forEach(value => observedByPoller.add(value));

          for (const result of results) {
            if (result.status === 'rejected') {
              rejections.push(String((result.reason as Error)?.message ?? result.reason));
            }
          }

          if (results.every(result => result.status === 'fulfilled')) fulfilledRuns += 1;

          finalValues.push(await fsp.readFile(TMP_FILE, 'utf8'));
        }
      } finally {
        clock.restore();
      }

      // AC3 — the interleaving was forced, not sampled: both writers were held
      // at the swap-file `open` on every single run.
      assert.strictEqual(
        barrierEntriesTotal,
        ITERATIONS * 2,
        `barrier held exactly 2 writers on each of ${ITERATIONS} runs`
      );

      // AC1 — both callers resolve, every run.
      assert.strictEqual(
        fulfilledRuns,
        ITERATIONS,
        `both updateFile calls fulfilled on ${ITERATIONS}/${ITERATIONS} runs` +
          (rejections.length ? ` — rejections: ${JSON.stringify(rejections.slice(0, 3))}` : '')
      );

      // AC1 — the surviving bytes are one caller's whole payload, never
      // 'initial', never a mixture, never truncated.
      const badFinals = finalValues.filter(value => value !== 'AAAA' && value !== 'BBBB');
      assert.strictEqual(badFinals.length, 0, `every final value is AAAA or BBBB — saw ${JSON.stringify(badFinals.slice(0, 3))}`);
      assert.strictEqual(finalValues.length, ITERATIONS, 'a final value was captured for every run');

      // AC7 — atomicity: a concurrent reader never observes a partial write.
      const torn = [...observedByPoller].filter(value => value !== 'initial' && value !== 'AAAA' && value !== 'BBBB');
      assert.strictEqual(torn.length, 0, `poller observed only whole values — torn/unexpected: ${JSON.stringify(torn.slice(0, 3))}`);
      assert.ok(observedByPoller.size > 0, 'the poller actually read the target during the race');

      // AC6 — no orphan swap files after the in-process race.
      assert.deepEqual(await swapFilesIn(TMP_DIR), [], 'no orphan swap files remain after concurrent saves');
    });
  });

  module('AC4 — swap names are unique within one millisecond', function() {
    test('1000 sequential saves under a pinned clock produce 1000 distinct swap names', async function(assert) {
      const SAMPLES = 1000;
      const clock = sinon.useFakeTimers({ now: PINNED_NOW, toFake: ['Date'] });
      const recorder = recordSwapPaths();

      try {
        await createFile(TMP_FILE, 'initial');
        recorder.paths.length = 0;

        for (let i = 0; i < SAMPLES; i += 1) {
          await updateFile(TMP_FILE, `payload-${i}`);
        }
      } finally {
        recorder.restore();
        clock.restore();
      }

      const swapNames = recorder.paths.filter(p => p.includes('.temp-'));

      assert.strictEqual(swapNames.length, SAMPLES, `captured a swap name for each of ${SAMPLES} saves`);
      assert.strictEqual(
        new Set(swapNames).size,
        SAMPLES,
        `all ${SAMPLES} swap names are distinct under a pinned clock — distinct: ${new Set(swapNames).size}`
      );
      assert.deepEqual(await swapFilesIn(TMP_DIR), [], 'no orphan swap files remain after 1000 saves');

      // The distinctness assertion above is only evidence if the token is wide
      // enough that 1000 samples are not a coin flip. Measure the width from
      // the samples themselves rather than trusting the implementation: bits =
      // token length x log2(observed alphabet). An 8-character hex token —
      // `randomUUID().slice(0, 8)`, the form Phase 3 HIGH-2 suggested — is 32
      // bits, at which 1000 samples collide with probability n^2/2^33 = 1.2e-4
      // and this very test fails about once in 8,600 CI runs. 40 bits puts that
      // under 1e-6; the shipped 8-character base64url token measures 48.
      const TOKEN_PREFIX = `.temp-${process.pid}-`;
      const tokens = swapNames.map(name => name.slice(name.indexOf(TOKEN_PREFIX) + TOKEN_PREFIX.length));
      const alphabet = new Set(tokens.join(''));
      const shortestToken = Math.min(...tokens.map(token => token.length));
      const bits = shortestToken * Math.log2(alphabet.size);

      assert.ok(
        bits >= 40,
        `swap token carries at least 40 bits — measured ${bits.toFixed(0)} ` +
        `(${shortestToken} chars over a ${alphabet.size}-symbol alphabet); ` +
        'below 40 the distinctness assertion above becomes flaky rather than load-bearing'
      );
    });
  });

  module('AC5 — uniqueness holds across processes', function() {
    test('two spawned children each running 300 saves on one path both exit 0', async function(assert) {
      const CHILD_SAVES = 300;
      await createFile(TMP_FILE, 'initial');

      const script = `
        const { updateFile } = await import(process.env.DIST_URL);
        for (let i = 0; i < ${CHILD_SAVES}; i += 1) {
          await updateFile(process.env.TARGET, process.env.PAYLOAD);
        }
      `;

      const runChild = (payload: string) => new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
          env: { ...process.env, DIST_URL: DIST_FILE_URL, TARGET: TMP_FILE, PAYLOAD: payload },
          stdio: ['ignore', 'ignore', 'pipe'],
        });

        let stderr = '';
        child.stderr.on('data', chunk => { stderr += String(chunk); });
        child.on('error', reject);
        child.on('close', code => resolve({ code, stderr }));
      });

      const [childA, childB] = await Promise.all([runChild('AAAA'), runChild('BBBB')]);

      // Report the error line, not node's stack banner — the banner says nothing
      // about *why* the child died.
      const reason = (stderr: string) =>
        stderr.split('\n').filter(line => /Error|code:|errno:/.test(line)).slice(0, 2).join(' | ') || '(no error line)';

      assert.strictEqual(childA.code, 0, `child A exited 0 — stderr: ${reason(childA.stderr)}`);
      assert.strictEqual(childB.code, 0, `child B exited 0 — stderr: ${reason(childB.stderr)}`);

      const final = await fsp.readFile(TMP_FILE, 'utf8');
      assert.ok(final === 'AAAA' || final === 'BBBB', `final file is exactly one child's payload — got ${JSON.stringify(final)}`);

      // AC6 — no orphan swap files after the cross-process race either.
      assert.deepEqual(await swapFilesIn(TMP_DIR), [], 'no orphan swap files remain after the cross-process race');
    });
  });

  module('AC6 — no orphan swap files, on success or failure', function() {
    test('a failed rename leaves no swap file behind', async function(assert) {
      await createFile(TMP_FILE, 'initial');

      const injected = Object.assign(new Error('injected rename failure'), { code: 'EIO' });
      sinon.stub(fsp, 'rename').rejects(injected);

      let caught: unknown;
      try {
        await updateFile(TMP_FILE, 'AAAA');
      } catch (error) {
        caught = error;
      }

      assert.strictEqual((caught as Error | undefined)?.message, 'injected rename failure', 'the rename failure propagated to the caller');
      assert.deepEqual(await swapFilesIn(TMP_DIR), [], 'the swap file was cleaned up on the rename-failure path');
      assert.strictEqual(await fsp.readFile(TMP_FILE, 'utf8'), 'initial', 'the target is untouched when the rename fails');
    });

    test('cleanup on the rename-failure path does not mask the original error', async function(assert) {
      await createFile(TMP_FILE, 'initial');

      const injectedRename = Object.assign(new Error('injected rename failure'), { code: 'EIO' });
      const injectedUnlink = Object.assign(new Error('injected unlink failure'), { code: 'EPERM' });

      sinon.stub(fsp, 'rename').rejects(injectedRename);
      const unlinkStub = sinon.stub(fsp, 'unlink').rejects(injectedUnlink);

      let caught: unknown;
      try {
        await updateFile(TMP_FILE, 'AAAA');
      } catch (error) {
        caught = error;
      }

      assert.strictEqual(unlinkStub.callCount, 1, 'cleanup was attempted exactly once');
      assert.strictEqual(
        (caught as Error | undefined)?.message,
        'injected rename failure',
        'the ORIGINAL rename error surfaces, not the cleanup error'
      );

      // The swap file survives here only because the injected unlink refused to
      // remove it; drop it so afterEach's readdir stays meaningful.
      unlinkStub.restore();
      for (const name of await swapFilesIn(TMP_DIR)) await fsp.unlink(path.join(TMP_DIR, name));
    });

    /**
     * PR #45, Phase 3 BLOCKER / Phase 2 HIGH / Phase 4 WARNING.
     *
     * `fsp.writeFile` is open(`wx`) → write → close. A write that fails *after*
     * the open succeeded (ENOSPC, EDQUOT, EIO) leaves a partial payload on disk.
     * The cleanup `try` originally wrapped only `fsp.rename`, so that file was
     * never unlinked — and because swap names are now unique, every such failure
     * left a *new* orphan instead of overwriting one (measured: 25 orphans /
     * 25,600 bytes on the branch vs 1 orphan / 1,024 bytes on the parent).
     */
    test('a writeFile that fails after creating the swap file leaves no orphan', async function(assert) {
      await createFile(TMP_FILE, 'initial');

      const realOpen = fsp.open;
      const injected = Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });

      // ENOSPC shape: the `wx` open succeeds and creates the file, the write of
      // the payload then fails part-way through. The real open runs, so the
      // swap file genuinely exists on disk with partial bytes in it — only the
      // write through the returned descriptor is made to fail.
      sinon.stub(fsp, 'open').callsFake(async (file, flags, mode) => {
        const handle = await realOpen(file, flags, mode);
        const realHandleWriteFile = handle.writeFile.bind(handle);

        handle.writeFile = async (_data: unknown, writeOptions: unknown) => {
          await realHandleWriteFile('PARTIAL', writeOptions as Parameters<typeof realHandleWriteFile>[1]);

          throw injected;
        };

        return handle;
      });

      let caught: unknown;
      try {
        await updateFile(TMP_FILE, 'AAAA');
      } catch (error) {
        caught = error;
      }

      assert.strictEqual((caught as Error | undefined)?.message, injected.message, 'the write failure propagated to the caller');
      assert.deepEqual(await swapFilesIn(TMP_DIR), [], 'the partially written swap file was cleaned up on the write-failure path');
      assert.strictEqual(await fsp.readFile(TMP_FILE, 'utf8'), 'initial', 'the target is untouched when the write fails');
    });

    /**
     * PR #45, Phase 3 blocker caveat — the second half of it.
     *
     * The caveat offered two shapes: exclude `EEXIST` from the cleanup, or set a
     * `created` flag once `writeFile` resolves and gate the unlink on that. They
     * are not equivalent. Keying on the code answers "is this error EEXIST?"
     * when the question that decides ownership is "did *this* call create the
     * path?" — so any EEXIST raised *after* a successful create is misread as
     * another writer's file and the swap is orphaned.
     *
     * That is reachable: `rename(2)` is POSIX-atomic over an existing target,
     * but Windows and some network filesystems surface `EEXIST`/`EPERM` for the
     * same call, and `@stonyx/utils` is a leaf dependency of apps this repo's
     * ubuntu-only CI never runs on.
     */
    test('an EEXIST raised after the swap file was created is still cleaned up', async function(assert) {
      await createFile(TMP_FILE, 'initial');

      // The write succeeds and creates the swap file — this call owns it — and
      // the rename then fails with the one code the cleanup special-cases.
      const injected = Object.assign(new Error('EEXIST: file already exists, rename'), { code: 'EEXIST' });
      sinon.stub(fsp, 'rename').rejects(injected);

      let caught: unknown;
      try {
        await updateFile(TMP_FILE, 'AAAA');
      } catch (error) {
        caught = error;
      }

      assert.strictEqual((caught as Error | undefined)?.message, injected.message, 'the rename failure propagated to the caller');
      assert.deepEqual(
        await swapFilesIn(TMP_DIR),
        [],
        'a swap file this call created is cleaned up even when the failure code is EEXIST'
      );
      assert.strictEqual(await fsp.readFile(TMP_FILE, 'utf8'), 'initial', 'the target is untouched');
    });
  });

  module("flag 'wx' — a residual name collision is loud, and is not ours to clean up", function() {
    /**
     * PR #45, Phase 4 WARNING-1 (`wx` had zero coverage — deleting the flag
     * measured 115 pass / 0 fail) and the Phase 3 caveat on the blocker fix
     * (unlinking on EEXIST would delete another writer's swap file and
     * reintroduce #44).
     */
    test('an occupied swap path surfaces as EEXIST, leaves the other writer\'s bytes intact, and does not touch the target', async function(assert) {
      await createFile(TMP_FILE, 'initial');

      const realOpen = fsp.open;
      let occupiedSwapPath = '';

      // Stand in for another writer that reached this exact swap path first:
      // occupy the path, then let the real `wx` open run against it.
      sinon.stub(fsp, 'open').callsFake(async (file, flags, mode) => {
        occupiedSwapPath = String(file);
        await fsp.writeFile(occupiedSwapPath, 'OTHER-WRITER', 'utf8');

        return realOpen(file, flags, mode);
      });

      let caught: NodeJS.ErrnoException | undefined;
      try {
        await updateFile(TMP_FILE, 'AAAA');
      } catch (error) {
        caught = error as NodeJS.ErrnoException;
      }

      assert.strictEqual(caught?.code, 'EEXIST', `wx refused to overwrite the occupied swap path — got ${caught?.code ?? 'no error'}`);
      assert.strictEqual(await fsp.readFile(TMP_FILE, 'utf8'), 'initial', 'the target is untouched when the swap path is occupied');
      assert.strictEqual(
        await fsp.readFile(occupiedSwapPath, 'utf8'),
        'OTHER-WRITER',
        "the other writer's swap bytes survived — EEXIST must never trigger cleanup"
      );
    });
  });

  module('swap-name length — a long basename must not regress to ENAMETOOLONG', function() {
    /**
     * PR #45, Phase 3 HIGH-2. A full canonical UUID put 48 characters of
     * overhead on the swap name; measured, a 210-character basename updated
     * fine on the parent and threw ENAMETOOLONG on the branch. `@stonyx/orm`
     * derives the basename from a consumer-controlled collection key, so that
     * band is reachable from ordinary configuration.
     */
    test('a 210-character basename updates without ENAMETOOLONG', async function(assert) {
      const longTarget = path.join(TMP_DIR, `${'x'.repeat(206)}.txt`);
      assert.strictEqual(path.basename(longTarget).length, 210, 'the fixture basename is 210 characters');

      await createFile(longTarget, 'initial');

      const recorder = recordSwapPaths();
      try {
        await updateFile(longTarget, 'AAAA');
      } finally {
        recorder.restore();
      }

      assert.strictEqual(await fsp.readFile(longTarget, 'utf8'), 'AAAA', 'the long-basename target was updated');
      assert.deepEqual(await swapFilesIn(TMP_DIR), [], 'no orphan swap file remains after a long-basename update');

      // Budget, not format: NAME_MAX is 255 on APFS and ext4, so the overhead
      // the swap name adds to the basename has to stay small enough that an
      // ordinary long filename still fits.
      const recordedSwapNames = recorder.paths.filter(p => p.includes('.temp-'));

      // Without this the budget assertion below passes vacuously when the
      // recorder is pointed at a call `updateFile` no longer makes: an empty
      // capture yields a negative overhead, which is trivially within budget.
      // Measured — with the recorder still on `fsp.writeFile` after the seam
      // moved to `fsp.open`, this test was one of the survivors while four
      // others reddened.
      assert.strictEqual(recordedSwapNames.length, 1, 'exactly one swap path was captured — the budget below is measured, not vacuous');

      const swapName = path.basename(recordedSwapNames[0] ?? '');
      assert.ok(
        swapName.length - path.basename(longTarget).length <= 24,
        `swap-name overhead stays within 24 characters — was ${swapName.length - path.basename(longTarget).length}`
      );
    });
  });

  module('mode preservation — an update must not widen the target', function() {
    /**
     * PR #45, Phase 3 HIGH-1. The swap file becomes the target's inode, so
     * without carrying the mode across a `0600` file is silently rewritten as
     * `0666 & ~umask`. `@stonyx/orm` writes its database through this function.
     */
    test('a 0600 target is still 0600 after an update', async function(assert) {
      await createFile(TMP_FILE, 'initial');
      await fsp.chmod(TMP_FILE, 0o600);

      await updateFile(TMP_FILE, 'AAAA');

      assert.strictEqual((await modeOf(TMP_FILE)).toString(8), '600', 'the restrictive mode survived the update');
      assert.strictEqual(await fsp.readFile(TMP_FILE, 'utf8'), 'AAAA', 'the payload still landed');
    });

    /**
     * The `mode` option on `writeFile` is masked by the umask, so under the
     * usual 022 a 0666 target would come back 0644 if `mode` were the only
     * mechanism. This is the case that requires the explicit `chmod`.
     */
    test('a 0666 target is still 0666 after an update, despite the umask', async function(assert) {
      await createFile(TMP_FILE, 'initial');
      await fsp.chmod(TMP_FILE, 0o666);

      await updateFile(TMP_FILE, 'AAAA');

      assert.strictEqual((await modeOf(TMP_FILE)).toString(8), '666', 'the permissive mode was not clipped by the umask');
      assert.strictEqual(await fsp.readFile(TMP_FILE, 'utf8'), 'AAAA', 'the payload still landed');
    });
  });

  module('swap-path hijack — the mode is applied to the descriptor, not the path', function() {
    /**
     * PR #45, Phase 3 HIGH-3. Preserving the target's mode (HIGH-1) needs an
     * explicit `chmod`, because the `mode` given to the open is umask-masked
     * and therefore only narrows. Done as `fsp.chmod(swapFile, ...)` that
     * `chmod` addresses a *path* and follows symlinks: an attacker with write
     * access to the directory unlinks the swap path while the write is in
     * flight, drops a symlink to a victim file in its place, and the `chmod`
     * lands on the victim with the writing process's privileges. CWE-59 /
     * CWE-732, and the victim never had to be writable by the attacker.
     *
     * Deliberately built without a stub on the seam the fix is written
     * against. The attacker here is an ordinary async loop doing real
     * `readdir`/`unlink`/`symlink` syscalls against the real directory while a
     * real `updateFile` runs, so what is measured is kernel symlink
     * resolution, not a mock of it. The payload is large enough that the swap
     * file exists for long enough to be hijacked without any timing trickery —
     * the vulnerable window opens the moment the swap file is created, not
     * when the write finishes, because an unlinked-but-open descriptor keeps
     * taking bytes while the path it used to occupy is already a symlink.
     *
     * Measured at 17d20823 (path-based `chmod`): 5/5 attempts widened the
     * victim 0600 -> 0666 with `updateFile` returning success. With the mode
     * applied to the descriptor instead: 10/10 attempts hijacked, 0 widened.
     */
    test('a swap path hijacked to a symlink does not widen the victim file', async function(assert) {
      const ATTEMPTS = 3;
      const victim = path.join(TMP_DIR, 'victim.txt');

      // 8 MiB: big enough that the swap file is open across many event-loop
      // turns, so the attacker below lands its hijack without racing a
      // sub-millisecond window.
      const payload = 'x'.repeat(8 * 1024 * 1024);

      const outcomes: { hijacked: number; victimMode: string; victimBody: string }[] = [];

      for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        await createFile(victim, 'SECRET');
        await fsp.chmod(victim, 0o600);

        // 0666 is the load-bearing source mode: it is the case that forces the
        // explicit chmod to exist at all, so it is the widest set of bits the
        // primitive can hand an attacker.
        await createFile(TMP_FILE, 'initial');
        await fsp.chmod(TMP_FILE, 0o666);

        let hijacked = 0;
        let running = true;

        const attacker = (async () => {
          while (running && hijacked === 0) {
            let names: string[] = [];
            try { names = await fsp.readdir(TMP_DIR); } catch { /* directory torn down */ }

            for (const name of names) {
              if (!name.includes('.temp-')) continue;

              try {
                await fsp.unlink(path.join(TMP_DIR, name));
                await fsp.symlink(victim, path.join(TMP_DIR, name));
                hijacked += 1;
                break;
              } catch { /* lost this one — the writer got there first */ }
            }

            await new Promise(resolve => setImmediate(resolve));
          }
        })();

        try {
          // Whether the update itself survives the hijack is not the subject:
          // an attacker who can unlink the swap path can always make the
          // rename fail. What must hold is that it cannot touch the victim.
          await updateFile(TMP_FILE, payload).catch(() => { /* denial of service is not this finding */ });
        } finally {
          running = false;
          await attacker;
        }

        outcomes.push({
          hijacked,
          victimMode: ((await fsp.lstat(victim)).mode & 0o7777).toString(8),
          victimBody: await fsp.readFile(victim, 'utf8'),
        });

        // The target is a symlink to the victim by now on some attempts; take
        // the directory back to a clean slate for the next one.
        await deleteDirectory(TMP_DIR).catch(() => {});
        await createDirectory(TMP_DIR);
      }

      // Without this the assertions below pass on any implementation at all,
      // including one that never creates a swap file — the attacker has to
      // have actually taken the path over for the mode check to mean anything.
      assert.strictEqual(
        outcomes.filter(outcome => outcome.hijacked > 0).length,
        ATTEMPTS,
        `the attacker took over the swap path on all ${ATTEMPTS} attempts — otherwise the checks below are vacuous`
      );

      assert.deepEqual(
        outcomes.map(outcome => outcome.victimMode),
        Array(ATTEMPTS).fill('600'),
        'the victim file was never widened through the hijacked swap path'
      );

      assert.deepEqual(
        outcomes.map(outcome => outcome.victimBody),
        Array(ATTEMPTS).fill('SECRET'),
        'the victim file was never written through the hijacked swap path either'
      );
    });
  });
});
