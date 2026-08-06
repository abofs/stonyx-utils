import { createInterface } from 'readline';
import type { Readable, Writable } from 'stream';

interface PromptOptions {
  input?: Readable;
  output?: Writable;
}

export function confirm(question: string, { input, output }: PromptOptions = {}): Promise<boolean> {
  if (!input && !process.stdin.isTTY) {
    return Promise.reject(
      new Error(
        'Interactive confirm() requires a TTY on stdin. ' +
        'For headless/container deployments, use the autoMigrate config option instead.'
      )
    );
  }

  const rl = createInterface({
    input: input ?? process.stdin,
    output: output ?? process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`${question} (y/N) `, (answer: string) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function prompt(question: string, { input, output }: PromptOptions = {}): Promise<string> {
  if (!input && !process.stdin.isTTY) {
    return Promise.reject(
      new Error(
        'Interactive prompt() requires a TTY on stdin. ' +
        'For headless/container deployments, configure non-interactive alternatives instead.'
      )
    );
  }

  const rl = createInterface({
    input: input ?? process.stdin,
    output: output ?? process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`${question} `, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
