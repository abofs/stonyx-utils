import QUnit from 'qunit';
import {
  camelCaseToKebabCase,
  kebabCaseToCamelCase,
  kebabCaseToPascalCase,
  generateRandomString
} from '@stonyx/utils/string';

const { module, test } = QUnit;

module('[Unit] Utils | camelCaseToKebabCase', function() {
  test('converts camelCase to kebab-case', function(assert) {
    assert.strictEqual(camelCaseToKebabCase('camelCase'), 'camel-case');
    assert.strictEqual(camelCaseToKebabCase('testModel'), 'test-model');
  });

  test('returns lowercase string unchanged', function(assert) {
    assert.strictEqual(camelCaseToKebabCase('alreadylower'), 'alreadylower');
  });

  test('handles consecutive capitals as a single block', function(assert) {
    assert.strictEqual(camelCaseToKebabCase('ABCDef'), 'abcdef');
    assert.strictEqual(camelCaseToKebabCase('innerHTML'), 'inner-html');
  });
});

module('[Unit] Utils | kebabCaseToCamelCase', function() {
  test('converts kebab-case to camelCase', function(assert) {
    assert.strictEqual(kebabCaseToCamelCase('kebab-case'), 'kebabCase');
    assert.strictEqual(kebabCaseToCamelCase('test-model'), 'testModel');
    assert.strictEqual(kebabCaseToCamelCase('user-profile-settings'), 'userProfileSettings');
  });

  test('handles single word (no dashes)', function(assert) {
    assert.strictEqual(kebabCaseToCamelCase('word'), 'word');
    assert.strictEqual(kebabCaseToCamelCase('test'), 'test');
  });

  test('handles multiple consecutive dashes', function(assert) {
    assert.strictEqual(kebabCaseToCamelCase('foo--bar'), 'fooBar');
    assert.strictEqual(kebabCaseToCamelCase('test---case'), 'testCase');
  });

  test('handles leading and trailing dashes', function(assert) {
    assert.strictEqual(kebabCaseToCamelCase('-leading'), 'Leading');
    assert.strictEqual(kebabCaseToCamelCase('trailing-'), 'trailing');
    assert.strictEqual(kebabCaseToCamelCase('-both-'), 'Both');
  });
});

module('[Unit] Utils | kebabCaseToPascalCase', function() {
  test('converts kebab-case to PascalCase', function(assert) {
    assert.strictEqual(kebabCaseToPascalCase('kebab-case'), 'KebabCase');
    assert.strictEqual(kebabCaseToPascalCase('test-model'), 'TestModel');
    assert.strictEqual(kebabCaseToPascalCase('user-profile-settings'), 'UserProfileSettings');
  });

  test('handles single word (no dashes)', function(assert) {
    assert.strictEqual(kebabCaseToPascalCase('word'), 'Word');
    assert.strictEqual(kebabCaseToPascalCase('test'), 'Test');
  });

  test('capitalizes first letter even without dashes', function(assert) {
    assert.strictEqual(kebabCaseToPascalCase('hello'), 'Hello');
    assert.strictEqual(kebabCaseToPascalCase('world'), 'World');
  });

  test('handles multiple consecutive dashes', function(assert) {
    assert.strictEqual(kebabCaseToPascalCase('foo--bar'), 'FooBar');
    assert.strictEqual(kebabCaseToPascalCase('test---case'), 'TestCase');
  });
});

module('[Unit] Utils | generateRandomString', function() {
  test('generates string of default length 8', function(assert) {
    const result = generateRandomString();
    assert.equal(result.length, 8, 'default length is 8');
    assert.ok(/^[A-Za-z0-9]+$/.test(result), 'contains only alphanumeric characters');
  });

  test('generates string of specified length', function(assert) {
    assert.equal(generateRandomString(5).length, 5);
    assert.equal(generateRandomString(12).length, 12);
    assert.equal(generateRandomString(20).length, 20);
  });

  test('generates different strings on each call', function(assert) {
    const str1 = generateRandomString(16);
    const str2 = generateRandomString(16);
    const str3 = generateRandomString(16);

    assert.notEqual(str1, str2, 'first and second strings are different');
    assert.notEqual(str2, str3, 'second and third strings are different');
    assert.notEqual(str1, str3, 'first and third strings are different');
  });

  test('only contains valid alphanumeric characters', function(assert) {
    const result = generateRandomString(100);
    assert.ok(/^[A-Za-z0-9]+$/.test(result), 'contains only A-Z, a-z, 0-9');
    assert.notOk(/[^A-Za-z0-9]/.test(result), 'no special characters or spaces');
  });

  test('handles edge case of length 1', function(assert) {
    const result = generateRandomString(1);
    assert.equal(result.length, 1);
    assert.ok(/^[A-Za-z0-9]$/.test(result));
  });
});
