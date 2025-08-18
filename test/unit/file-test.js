import QUnit from 'qunit';
import path from 'path';
import { promises as fsp } from 'fs';
import {
  createFile,
  updateFile,
  copyFile,
  readFile,
  deleteFile,
  deleteDirectory,
  createDirectory,
  forEachFileImport,
  fileExists
} from '@stonyx/utils/file';

const { module, test } = QUnit;

const TMP_DIR = path.resolve('./__tmp__');
const TMP_FILE = path.join(TMP_DIR, 'test.txt');
const TMP_JSON_FILE = path.join(TMP_DIR, 'test.json');

module('[Unit] File', function(hooks) {
  hooks.beforeEach(async () => {
    await deleteDirectory(TMP_DIR).catch(() => {});
    await createDirectory(TMP_DIR);
  });

  hooks.afterEach(async () => {
    await deleteDirectory(TMP_DIR).catch(() => {});
  });

  module('createFile', function() {
    test('creates a plain text file', async function(assert) {
      await createFile(TMP_FILE, 'hello world');
      const data = await fsp.readFile(TMP_FILE, 'utf8');
      assert.equal(data, 'hello world');
    });

    test('creates a JSON file when option.json is true', async function(assert) {
      await createFile(TMP_JSON_FILE, { foo: 'bar' }, { json: true });
      const data = JSON.parse(await fsp.readFile(TMP_JSON_FILE, 'utf8'));
      assert.deepEqual(data, { foo: 'bar' });
    });
  });

  module('updateFile', function() {
    test('updates an existing file', async function(assert) {
      await createFile(TMP_FILE, 'old');
      await updateFile(TMP_FILE, 'new');
      const data = await fsp.readFile(TMP_FILE, 'utf8');
      assert.equal(data, 'new');
    });

    test('throws if file does not exist', async function(assert) {
      try {
        await updateFile(TMP_FILE, 'data');
        assert.ok(false, 'should not reach');
      } catch (err) {
        assert.ok(err instanceof Error);
      }
    });
  });

  module('copyFile', function() {
    const COPY_TARGET = path.join(TMP_DIR, 'copy.txt');

    test('copies a file successfully', async function(assert) {
      await createFile(TMP_FILE, 'data');
      const success = await copyFile(TMP_FILE, COPY_TARGET);
      assert.ok(success);
      const data = await fsp.readFile(COPY_TARGET, 'utf8');
      assert.equal(data, 'data');
    });

    test('does not overwrite without overwrite option', async function(assert) {
      await createFile(TMP_FILE, 'data1');
      await createFile(COPY_TARGET, 'data2');
      const result = await copyFile(TMP_FILE, COPY_TARGET, { overwrite: false });
      const data = await fsp.readFile(COPY_TARGET, 'utf8');
      assert.equal(result, false);
      assert.equal(data, 'data2');
    });

    test('overwrites when overwrite option is true', async function(assert) {
      await createFile(TMP_FILE, 'data1');
      await createFile(COPY_TARGET, 'data2');
      const result = await copyFile(TMP_FILE, COPY_TARGET, { overwrite: true });
      const data = await fsp.readFile(COPY_TARGET, 'utf8');
      assert.equal(result, true);
      assert.equal(data, 'data1');
    });
  });

  module('readFile', function() {
    test('reads plain text', async function(assert) {
      await createFile(TMP_FILE, 'hello');
      const result = await readFile(TMP_FILE);
      assert.equal(result, 'hello');
    });

    test('reads JSON', async function(assert) {
      await createFile(TMP_JSON_FILE, { foo: 'bar' }, { json: true });
      const result = await readFile(TMP_JSON_FILE, { json: true });
      assert.deepEqual(result, { foo: 'bar' });
    });

    test('calls missingFileCallback when file does not exist', async function(assert) {
      const result = await readFile('nonexistent.txt', {
        missingFileCallback: () => 'fallback',
      });
      assert.equal(result, 'fallback');
    });
  });

  module('deleteFile', function() {
    test('deletes an existing file', async function(assert) {
      await createFile(TMP_FILE, 'data');
      await deleteFile(TMP_FILE);
      try {
        await fsp.access(TMP_FILE);
        assert.ok(false, 'file should not exist');
      } catch {
        assert.ok(true);
      }
    });

    test('ignores access failure when option set', async function(assert) {
      await deleteFile(TMP_FILE, { ignoreAccessFailure: true });
      assert.ok(true, 'did not throw');
    });
  });

  module('deleteDirectory', function() {
    test('deletes a directory recursively', async function(assert) {
      const subDir = path.join(TMP_DIR, 'sub');
      await createDirectory(subDir);
      await deleteDirectory(subDir);
      try {
        await fsp.access(subDir);
        assert.ok(false);
      } catch {
        assert.ok(true);
      }
    });
  });

  module('createDirectory', function() {
    test('creates directory recursively', async function(assert) {
      const deepDir = path.join(TMP_DIR, 'a/b/c');
      await createDirectory(deepDir);
      const stat = await fsp.stat(deepDir);
      assert.ok(stat.isDirectory());
    });
  });

  module('forEachFileImport', function() {
    const IMPORT_DIR = path.join(TMP_DIR, 'import-test');

    hooks.beforeEach(async () => {
      await createDirectory(IMPORT_DIR);
    });

    test('calls callback for each .js file', async function(assert) {
      const filePath = path.join(IMPORT_DIR, 'hello-world.js');
      await fsp.writeFile(filePath, 'export default "hello";', 'utf8');

      let called = false;
      await forEachFileImport(IMPORT_DIR, (output, meta) => {
        called = true;
        assert.equal(output, 'hello');
        assert.equal(meta.name, 'helloWorld');
      });

      assert.ok(called);
    });

    test('returns when directory missing with ignoreAccessFailure', async function(assert) {
      const missingDir = path.join(IMPORT_DIR, 'does-not-exist');
      await forEachFileImport(missingDir, () => {
        assert.ok(false, 'should not be called');
      }, { ignoreAccessFailure: true });
      assert.ok(true, 'no throw');
    });

    test('throws if callback is not a function', async function(assert) {
      try {
        await forEachFileImport(IMPORT_DIR, null);
        assert.ok(false);
      } catch (err) {
        assert.ok(err instanceof Error);
      }
    });
  });

  module('fileExists', function() {
    test('returns true when file exists', async function(assert) {
      await createFile(TMP_FILE, 'data');
      const exists = await fileExists(TMP_FILE);
      assert.ok(exists);
    });
  
    test('returns false when file does not exist', async function(assert) {
      const exists = await fileExists(path.join(TMP_DIR, 'nonexistent.txt'));
      assert.notOk(exists);
    });
  });
});
