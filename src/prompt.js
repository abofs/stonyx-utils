import { createInterface } from 'readline';

function createReadline() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export function confirm(question) {
  const rl = createReadline();

  return new Promise(resolve => {
    rl.question(`${question} (y/N) `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function prompt(question) {
  const rl = createReadline();

  return new Promise(resolve => {
    rl.question(`${question} `, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
