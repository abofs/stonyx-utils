function kebabToCase(str: string, pascal = false): string {
  let out = '';
  let upperNext = pascal; // PascalCase starts uppercase
  for (let i = 0; i < str.length; i++) {
    const ch = str.charAt(i);
    if (ch === '-') {
      upperNext = true;
    } else if (upperNext) {
      out += ch.toUpperCase();
      upperNext = false;
    } else {
      out += ch;
    }
  }
  return out;
}

export function kebabCaseToCamelCase(str: string): string {
  return kebabToCase(str, false);
}

export function kebabCaseToPascalCase(str: string): string {
  return kebabToCase(str, true);
}

export function camelCaseToKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function generateRandomString(length = 8): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array(length).fill('').map(() => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
}

export { default as pluralize } from './plurarize.js';
