/**
 * Runs every sample in test/sample/ and asserts on what each call produced.
 * The samples import @stonyx/utils/<subpath>, so they run against the built
 * dist/ entries a consumer installs.
 */
import QUnit from 'qunit';
import sinon from 'sinon';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import FuzzyMatch from '@stonyx/utils/fuzzy-match';
import { timestamps } from '../sample/date.js';
import { copyAndEdit, serialize, normalizeToArray, mergeConfig, readNested, cacheByKey } from '../sample/object.js';
import { manageConfigFile, streamLines, loadModules } from '../sample/file.js';
import { retryAfter } from '../sample/promise.js';
import { askProjectName, askToOverwrite } from '../sample/prompt.js';
import { convertCase, randomIds, pluralNames } from '../sample/string.js';
import { reconcileFixture } from '../sample/fuzzy-match.js';

const { module, test } = QUnit;

function mockStreams(answer: string): { input: Readable; output: Writable; written: () => string } {
  const input = Readable.from([`${answer}\n`]);
  let text = '';
  const output = new Writable({
    write(chunk: Buffer | string, _encoding: BufferEncoding, callback: () => void) {
      text += chunk.toString();
      callback();
    },
  });

  return { input, output, written: () => text };
}

function gitStatus(): string {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: process.cwd(), encoding: 'utf8' });
}

module('[Unit] Samples', function (hooks) {
  // Samples work in a mkdtemp dir; this catches one that writes into the repo instead.
  let statusBefore: string;
  hooks.beforeEach(() => {
    statusBefore = gitStatus();
  });
  hooks.afterEach((assert) => {
    assert.strictEqual(gitStatus(), statusBefore, 'the sample left the working tree as it found it');
  });

  test('importing a sample prints nothing and runs nothing', function (assert) {
    // A fresh process, so the module cache this suite already filled cannot hide an import-time effect.
    // The list comes from the .ts sources, so a stale compiled file left in dist-test/ is not imported.
    const sources = readdirSync(join(process.cwd(), 'test', 'sample'), { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts'));
    const compiled = sources.map((file) => join(process.cwd(), 'dist-test', 'test', 'sample', file.replace(/\.ts$/, '.js')));
    const script = `
      import { pathToFileURL } from 'node:url';
      const calls = [];
      for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace']) console[method] = () => calls.push(method);
      const write = process.stdout.write.bind(process.stdout);
      process.stdout.write = () => (calls.push('stdout'), true);
      process.stderr.write = () => (calls.push('stderr'), true);
      const files = process.argv.slice(1);
      for (const file of files) await import(pathToFileURL(file).href);
      write(JSON.stringify({ calls }));
    `;
    const result = JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '-e', script, ...compiled], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    ) as { calls: string[] };

    assert.ok(sources.length > 0, `found ${sources.length} sample source(s)`);
    assert.deepEqual(result.calls, [], 'no console or stdio output at import');
  });

  module('date', function (hooks) {
    let clock: sinon.SinonFakeTimers;
    hooks.beforeEach(() => {
      clock = sinon.useFakeTimers({ now: new Date('2026-01-02T03:04:05.999Z'), toFake: ['Date'] });
    });
    hooks.afterEach(() => clock.restore());

    test('getTimestamp() is now in whole seconds; getTimestamp(date) is that date', function (assert) {
      assert.deepEqual(timestamps(new Date('2020-01-01T00:00:00.750Z')), {
        now: Math.floor(Date.parse('2026-01-02T03:04:05.999Z') / 1000),
        at: 1577836800,
      });
    });
  });

  module('object', function () {
    test('deepCopy returns a detached clone', function (assert) {
      assert.deepEqual(copyAndEdit(), { original: { tags: ['a'] }, copy: { tags: ['a', 'b'] } });
    });

    test('objToJson indents with a tab by default', function (assert) {
      assert.deepEqual(serialize(), { tabbed: '{\n\t"port": 3000\n}', twoSpaces: '{\n  "port": 3000\n}' });
    });

    test('makeArray wraps a value and passes arrays through', function (assert) {
      assert.deepEqual(normalizeToArray(), { single: ['admin'], many: ['admin', 'editor'] });
    });

    test('mergeObject deep-merges, and ignoreNewKeys drops unknown keys', function (assert) {
      assert.deepEqual(mergeConfig(), {
        merged: { server: { port: 8080, host: 'localhost' }, debug: false, extra: true },
        knownKeysOnly: { server: { port: 8080, host: 'localhost' }, debug: false },
      });
    });

    test('get reads a dot path and returns undefined for a missing segment', function (assert) {
      assert.deepEqual(readNested(), { host: 'example.com', missing: undefined });
    });

    test('getOrSet stores a default on a miss and returns the stored value after', function (assert) {
      assert.deepEqual(cacheByKey(), { first: ['alice'], second: ['alice'], sameArray: true, size: 1 });
    });
  });

  module('file', function (hooks) {
    let dir: string;
    hooks.beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'stonyx-utils-sample-'));
    });
    hooks.afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    test('create, update, read, copy and delete a config file', async function (assert) {
      assert.deepEqual(await manageConfigFile(dir), {
        saved: { port: 4000 },
        copied: true,
        copiedWithoutOverwrite: false,
        copiedWithOverwrite: true,
        fallback: 'default contents',
        existsAfterDelete: false,
        backupDirExistsAfterDelete: false,
      });
      assert.deepEqual(await readdir(dir, { recursive: true }), ['config'], 'only the emptied config directory is left');
    });

    test('write and read a file through streams', async function (assert) {
      assert.strictEqual(await streamLines(dir, ['started', 'stopped']), 'started\nstopped\n');
      assert.deepEqual(await readdir(dir), [], 'the sample removed its log file');
    });

    test('forEachFileImport loads every module under a directory', async function (assert) {
      assert.deepEqual(await loadModules(dir), {
        'billing/creditCard': { table: 'credit_cards' },
        userProfile: { table: 'user_profiles' },
      });
      assert.deepEqual(await readdir(dir), [], 'the sample removed its modules directory');
    });
  });

  module('promise', function (hooks) {
    let clock: sinon.SinonFakeTimers;
    hooks.beforeEach(() => {
      clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });
    });
    hooks.afterEach(() => clock.restore());

    test('sleep waits the given number of seconds', async function (assert) {
      let settled = false;
      const result = retryAfter(2, () => 'retried').then((value) => {
        settled = true;
        return value;
      });

      await clock.tickAsync(1999);
      assert.false(settled, 'still waiting 1ms before 2 seconds');

      await clock.tickAsync(1);
      assert.strictEqual(await result, 'retried');
    });
  });

  module('prompt', function () {
    test('prompt resolves with the trimmed answer', async function (assert) {
      const streams = mockStreams('  my-app  ');

      assert.strictEqual(await askProjectName(streams), 'my-app');
      assert.true(streams.written().includes('Project name? '), 'the question was written to output');
    });

    test('confirm resolves true for "y" and false otherwise', async function (assert) {
      const yes = mockStreams('Y');
      const no = mockStreams('yes');

      assert.true(await askToOverwrite(yes));
      assert.false(await askToOverwrite(no), 'only "y" confirms');
      assert.true(yes.written().includes('Overwrite existing config? (y/N) '), 'the question carries the (y/N) hint');
    });
  });

  module('string', function () {
    test('case conversions', function (assert) {
      assert.deepEqual(convertCase(), { camel: 'userProfile', pascal: 'UserProfile', kebab: 'user-profile' });
    });

    test('generateRandomString returns alphanumerics of the requested length', function (assert) {
      const { short, long } = randomIds();

      assert.ok(/^[A-Za-z0-9]{8}$/.test(short), `default length is 8 (${short})`);
      assert.ok(/^[A-Za-z0-9]{32}$/.test(long), `explicit length is honoured (${long.length})`);
    });

    test('pluralize', function (assert) {
      assert.deepEqual(pluralNames(), ['cities', 'People', 'sheep', 'BOXES']);
    });
  });

  module('fuzzy-match', function (hooks) {
    hooks.afterEach(() => sinon.restore());

    test('normalize, similarity and findBestMatch', function (assert) {
      const normalize = sinon.spy(FuzzyMatch.prototype, 'normalize');
      const similarity = sinon.spy(FuzzyMatch.prototype, 'similarity');
      const findBestMatch = sinon.spy(FuzzyMatch.prototype, 'findBestMatch');

      assert.deepEqual(reconcileFixture(), {
        normalized: 'atletico madrid',
        score: 0.9,
        best: { name: 'Real Madrid · Atlético Madrid', id: 2 },
        belowThreshold: null,
      });

      // The sample and this test resolve the same dist module, so the spies see the sample's calls.
      assert.true(normalize.calledWith('Atlético-Madrid FC'), 'normalize was called directly');
      assert.true(similarity.calledWith('Real Madrid', 'Real Madrid CF'), 'similarity was called directly');
      assert.strictEqual(findBestMatch.callCount, 2, 'findBestMatch was called for both lookups');
    });
  });
});
