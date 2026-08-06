import QUnit from 'qunit';
import { Readable, Writable } from 'stream';
import { confirm, prompt } from '@stonyx/utils/prompt';

const { module, test } = QUnit;

interface MockStreams {
  input: Readable;
  output: Writable;
  getOutput: () => string;
}

function createMockStreams(inputText: string): MockStreams {
  const input = new Readable({
    read() {
      this.push(inputText + '\n');
      this.push(null);
    }
  });

  let written = '';
  const output = new Writable({
    write(chunk: Buffer | string, _encoding: BufferEncoding, callback: () => void) {
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
      const result: boolean = await confirm('Apply?', { input, output });
      assert.true(result);
    });

    test('returns true when user types "Y" (case insensitive)', async function(assert) {
      const { input, output } = createMockStreams('Y');
      const result: boolean = await confirm('Apply?', { input, output });
      assert.true(result);
    });

    test('returns false when user types "n"', async function(assert) {
      const { input, output } = createMockStreams('n');
      const result: boolean = await confirm('Apply?', { input, output });
      assert.false(result);
    });

    test('returns false for empty input (default N)', async function(assert) {
      const { input, output } = createMockStreams('');
      const result: boolean = await confirm('Apply?', { input, output });
      assert.false(result);
    });

    test('returns false for non-y input', async function(assert) {
      const { input, output } = createMockStreams('yes');
      const result: boolean = await confirm('Apply?', { input, output });
      assert.false(result);
    });

    test('trims whitespace from answer', async function(assert) {
      const { input, output } = createMockStreams('  y  ');
      const result: boolean = await confirm('Apply?', { input, output });
      assert.true(result);
    });

    test('throws on non-TTY when no custom input is provided', async function(assert) {
      const originalIsTTY = process.stdin.isTTY;
      try {
        Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
        await assert.rejects(
          confirm('test?'),
          (err: Error) => /TTY|interactive/i.test(err.message),
          'should reject with TTY-related error'
        );
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      }
    });

    test('works with custom input stream regardless of TTY', async function(assert) {
      const originalIsTTY = process.stdin.isTTY;
      try {
        Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
        const { input, output } = createMockStreams('y');
        const result: boolean = await confirm('test?', { input, output });
        assert.true(result);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      }
    });
  });

  module('prompt', function() {
    test('returns trimmed user input', async function(assert) {
      const { input, output } = createMockStreams('  hello world  ');
      const result: string = await prompt('Name?', { input, output });
      assert.equal(result, 'hello world');
    });

    test('returns empty string for empty input', async function(assert) {
      const { input, output } = createMockStreams('');
      const result: string = await prompt('Name?', { input, output });
      assert.equal(result, '');
    });
  });
});
