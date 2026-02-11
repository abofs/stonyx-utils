import QUnit from 'qunit';
import { Readable, Writable } from 'stream';
import { confirm, prompt } from '@stonyx/utils/prompt';

const { module, test } = QUnit;

function createMockStreams(inputText) {
  const input = new Readable({
    read() {
      this.push(inputText + '\n');
      this.push(null);
    }
  });

  let written = '';
  const output = new Writable({
    write(chunk, encoding, callback) {
      written += chunk.toString();
      callback();
    }
  });

  return { input, output, getOutput: () => written };
}

module('[Unit] Prompt', function() {
  module('confirm', function() {
    test('returns true when user types "y"', async function(assert) {
      const { input, output } = createMockStreams('y');
      const result = await confirm('Apply?', { input, output });
      assert.true(result);
    });

    test('returns true when user types "Y" (case insensitive)', async function(assert) {
      const { input, output } = createMockStreams('Y');
      const result = await confirm('Apply?', { input, output });
      assert.true(result);
    });

    test('returns false when user types "n"', async function(assert) {
      const { input, output } = createMockStreams('n');
      const result = await confirm('Apply?', { input, output });
      assert.false(result);
    });

    test('returns false for empty input (default N)', async function(assert) {
      const { input, output } = createMockStreams('');
      const result = await confirm('Apply?', { input, output });
      assert.false(result);
    });

    test('returns false for non-y input', async function(assert) {
      const { input, output } = createMockStreams('yes');
      const result = await confirm('Apply?', { input, output });
      assert.false(result);
    });

    test('trims whitespace from answer', async function(assert) {
      const { input, output } = createMockStreams('  y  ');
      const result = await confirm('Apply?', { input, output });
      assert.true(result);
    });
  });

  module('prompt', function() {
    test('returns trimmed user input', async function(assert) {
      const { input, output } = createMockStreams('  hello world  ');
      const result = await prompt('Name?', { input, output });
      assert.equal(result, 'hello world');
    });

    test('returns empty string for empty input', async function(assert) {
      const { input, output } = createMockStreams('');
      const result = await prompt('Name?', { input, output });
      assert.equal(result, '');
    });
  });
});
