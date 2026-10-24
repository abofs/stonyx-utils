/**
 * Canonical usage of @stonyx/utils/string. Nothing runs at import time.
 */
import {
  kebabCaseToCamelCase,
  kebabCaseToPascalCase,
  camelCaseToKebabCase,
  generateRandomString,
  pluralize,
} from '@stonyx/utils/string';

/** Convert between the naming styles a model or file name passes through. */
export function convertCase(): { camel: string; pascal: string; kebab: string } {
  return {
    camel: kebabCaseToCamelCase('user-profile'),
    pascal: kebabCaseToPascalCase('user-profile'),
    kebab: camelCaseToKebabCase('userProfile'),
  };
}

/** generateRandomString returns alphanumeric characters, 8 by default. */
export function randomIds(): { short: string; long: string } {
  return {
    short: generateRandomString(),
    long: generateRandomString(32),
  };
}

/** pluralize handles regular, irregular and uncountable nouns and keeps casing. */
export function pluralNames(): string[] {
  return ['city', 'Person', 'sheep', 'BOX'].map(pluralize);
}
