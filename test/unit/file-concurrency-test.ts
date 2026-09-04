/**
 * Concurrency coverage for `updateFile` — abofs/stonyx-utils#44.
 *
 * `updateFile` named its swap file `${filePath}.temp-${getTimestamp()}`, a
 * whole-second token. Two overlapping calls on one path inside one second
 * therefore computed the *same* swap name: writer B overwrote writer A's swap
 * bytes, A's rename moved B's payload under A's name, and B's rename threw
 * ENOENT.
 *
 * ACs are numbered per the 2026-09-04 refinement comment on the issue.
 *
 * No production seam is added for testability (AC3(a) was struck). The two
 * test-only mechanisms are:
 *   1. `sinon.useFakeTimers({ toFake: ['Date'] })` — pins `Date.now()`, so
 *      `getTimestamp()` cannot straddle a second boundary and accidentally
 *      hand the two writers distinct names.
 *   2. A barrier assigned onto the shared `fs.promises` object. `dist/file.js`
 *      resolves `fsp.writeFile` at call time, so replacing that property holds
 *      every writer at the point where its swap name is already computed but
 *      no bytes have been written.
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

type MutableFsp = {
  writeFile: typeof fsp.writeFile;
  rename: typeof fsp.rename;
  unlink: typeof fsp.unlink;
};

const mutableFsp = fsp as unknown as MutableFsp;

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
    restore: () => { mutableFsp.writeFile = realWriteFile; release(); },
  };

  mutableFsp.writeFile = (async function(this: unknown, ...args: unknown[]) {
    barrier.entered += 1;
    barrier.paths.push(String(args[0]));

    if (barrier.entered >= expected) release();

    // Fail-safe: never hang the suite if a writer dies before reaching the gate.
    await Promise.race([gate, new Promise<void>(r => setTimeout(r, 5000))]);

    return (realWriteFile as (...a: unknown[]) => Promise<void>).apply(this, args);
  }) as unknown as typeof fsp.writeFile;

  return barrier;
}

/** Record every path handed to `fsp.writeFile` without altering its behaviour. */
function recordWritePaths(): { paths: string[]; restore: () => void } {
  const realWriteFile = fsp.writeFile;
  const paths: string[] = [];

  mutableFsp.writeFile = (async function(this: unknown, ...args: unknown[]) {
    paths.push(String(args[0]));
    return (realWriteFile as (...a: unknown[]) => Promise<void>).apply(this, args);
  }) as unknown as typeof fsp.writeFile;

  return { paths, restore: () => { mutableFsp.writeFile = realWriteFile; } };
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

          let results;
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

      const realRename = fsp.rename;
      const injected = Object.assign(new Error('injected rename failure'), { code: 'EIO' });

      mutableFsp.rename = (async () => { throw injected; }) as unknown as typeof fsp.rename;

      let caught: unknown;
      try {
        await updateFile(TMP_FILE, 'AAAA');
      } catch (error) {
        caught = error;
      } finally {
        mutableFsp.rename = realRename;
      }

      assert.strictEqual((caught as Error | undefined)?.message, 'injected rename failure', 'the rename failure propagated to the caller');
      assert.deepEqual(await swapFilesIn(TMP_DIR), [], 'the swap file was cleaned up on the rename-failure path');
      assert.strictEqual(await fsp.readFile(TMP_FILE, 'utf8'), 'initial', 'the target is untouched when the rename fails');
    });

    test('cleanup on the rename-failure path does not mask the original error', async function(assert) {
      await createFile(TMP_FILE, 'initial');

      const realRename = fsp.rename;
      const realUnlink = fsp.unlink;
      const injectedRename = Object.assign(new Error('injected rename failure'), { code: 'EIO' });
      const injectedUnlink = Object.assign(new Error('injected unlink failure'), { code: 'EPERM' });
      let unlinkCalls = 0;

      mutableFsp.rename = (async () => { throw injectedRename; }) as unknown as typeof fsp.rename;
      mutableFsp.unlink = (async () => { unlinkCalls += 1; throw injectedUnlink; }) as unknown as typeof fsp.unlink;

      let caught: unknown;
      try {
        await updateFile(TMP_FILE, 'AAAA');
      } catch (error) {
        caught = error;
      } finally {
        mutableFsp.rename = realRename;
        mutableFsp.unlink = realUnlink;
      }

      assert.strictEqual(unlinkCalls, 1, 'cleanup was attempted exactly once');
      assert.strictEqual(
        (caught as Error | undefined)?.message,
        'injected rename failure',
        'the ORIGINAL rename error surfaces, not the cleanup error'
      );

      // The swap file survives here only because the injected unlink refused to
      // remove it; drop it so afterEach's readdir stays meaningful.
      for (const name of await swapFilesIn(TMP_DIR)) await realUnlink(path.join(TMP_DIR, name));
    });
  });
});
