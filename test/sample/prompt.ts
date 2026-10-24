/**
 * Canonical usage of @stonyx/utils/prompt. Nothing runs at import time.
 *
 * Both functions read stdin and write stdout by default, and reject when stdin
 * is not a TTY. Pass `input` and `output` streams to drive them from anything
 * else (a test, a pipe, a socket).
 */
import { confirm, prompt } from '@stonyx/utils/prompt';
import type { Readable, Writable } from 'node:stream';

interface Streams {
  input: Readable;
  output: Writable;
}

/** prompt resolves with the trimmed answer. */
export function askProjectName(streams: Streams): Promise<string> {
  return prompt('Project name?', streams);
}

/** confirm appends "(y/N)" and resolves true only for "y" or "Y". */
export function askToOverwrite(streams: Streams): Promise<boolean> {
  return confirm('Overwrite existing config?', streams);
}
