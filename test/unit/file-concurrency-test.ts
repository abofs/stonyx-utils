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
 *   2. `sinon.stub(fsp, 'writeFile')` etc. `dist/file.js` resolves `fsp.writeFile`
 *      at call time, so stubbing that property holds every writer at the point
 *      where its swap name is already computed but no bytes have been written.
 *      Stubs go through sinon rather than hand-assignment so the `sinon.restore()`
 *      in `afterEach` actually owns them — `fs.promises` is a process-global
 *      object and QUnit runs every test file in one process, so a leaked patch
 *      would surface in an unrelated suite.
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
  /** How many writers have reached `fsp.writeFile` and been held. */
  entered: number;
  /** Every path passed to `fsp.writeFile` while the barrier was installed. */
  paths: string[];
  restore: () => void;
}

/**
 * Hold every `fsp.writeFile` caller until `expected` of them have entered.
 *
 * Each writer's swap name is computed *before* its `writeFile` call, so by the
 * time the barrier releases both names are already fixed. Pre-fix they are the
 * same string; the barrier makes the resulting clobber deterministic instead of
 * dependent on scheduler luck.
 */
function installWriteBarrier(expected: number): Barrier {
  const realWriteFile = fsp.writeFile;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });

  const barrier: Barrier = {
    entered: 0,
    paths: [],
    restore: () => { stub.restore(); release(); },
  };

  const stub = sinon.stub(fsp, 'writeFile').callsFake(async (file, data, options) => {
    barrier.entered += 1;
    barrier.paths.push(String(file));

    if (barrier.entered >= expected) release();

    // Fail-safe: never hang the suite if a writer dies before reaching the gate.
    await Promise.race([gate, new Promise<void>(r => setTimeout(r, 5000))]);

    return realWriteFile(file, data, options);
  });

  return barrier;
}

/** Record every path handed to `fsp.writeFile` without altering its behaviour. */
function recordWritePaths(): { paths: string[]; restore: () => void } {
  const realWriteFile = fsp.writeFile;
  const paths: string[] = [];

  const stub = sinon.stub(fsp, 'writeFile').callsFake(async (file, data, options) => {
    paths.push(String(file));

    return realWriteFile(file, data, options);
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
          const barrier = installWriteBarrier(2);

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
      // at `writeFile` on every single run.
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
      const recorder = recordWritePaths();

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

      const realWriteFile = fsp.writeFile;
      const injected = Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });

      // ENOSPC shape: the `wx` open succeeds and creates the file, the write of
      // the payload then fails part-way through.
      sinon.stub(fsp, 'writeFile').callsFake(async (file, _data, options) => {
        await realWriteFile(file, 'PARTIAL', options);

        throw injected;
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

      const realWriteFile = fsp.writeFile;
      let occupiedSwapPath = '';

      // Stand in for another writer that reached this exact swap path first.
      sinon.stub(fsp, 'writeFile').callsFake(async (file, data, options) => {
        occupiedSwapPath = String(file);
        await realWriteFile(occupiedSwapPath, 'OTHER-WRITER', 'utf8');

        return realWriteFile(file, data, options);
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

      const recorder = recordWritePaths();
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
      const swapName = path.basename(recorder.paths.filter(p => p.includes('.temp-'))[0] ?? '');
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
});
