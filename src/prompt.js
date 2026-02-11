import { createInterface } from 'readline';

export function confirm(question, { input, output } = {}) {
  const rl = createInterface({
    input: input ?? process.stdin,
    output: output ?? process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`${question} (y/N) `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function prompt(question, { input, output } = {}) {
  const rl = createInterface({
    input: input ?? process.stdin,
    output: output ?? process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`${question} `, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
