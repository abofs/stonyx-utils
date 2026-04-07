import { createInterface } from 'readline';
import type { Readable, Writable } from 'stream';

interface PromptOptions {
  input?: Readable;
  output?: Writable;
}

export function confirm(question: string, { input, output }: PromptOptions = {}): Promise<boolean> {
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
