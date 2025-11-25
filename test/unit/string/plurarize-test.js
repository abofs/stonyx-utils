import QUnit from 'qunit';
import { pluralize } from '@stonyx/utils/string';

const { module, test } = QUnit;

module('[Unit] Utils | pluralize', function() {
  // --- Irregular nouns ---
  test('handles irregular plurals correctly', function(assert) {
    assert.strictEqual(pluralize('person'), 'people');
    assert.strictEqual(pluralize('man'), 'men');
    assert.strictEqual(pluralize('woman'), 'women');
    assert.strictEqual(pluralize('child'), 'children');
    assert.strictEqual(pluralize('tooth'), 'teeth');
    assert.strictEqual(pluralize('foot'), 'feet');
    assert.strictEqual(pluralize('mouse'), 'mice');
    assert.strictEqual(pluralize('goose'), 'geese');
    assert.strictEqual(pluralize('ox'), 'oxen');
    assert.strictEqual(pluralize('criterion'), 'criteria');
    assert.strictEqual(pluralize('phenomenon'), 'phenomena');
  });

  test('preserves capitalization for irregulars', function(assert) {
    assert.strictEqual(pluralize('Person'), 'People');
    assert.strictEqual(pluralize('Mouse'), 'Mice');
    assert.strictEqual(pluralize('Child'), 'Children');
  });

  // --- Regular rule-based ---
  test('adds "es" for words ending in s, x, z, ch, sh', function(assert) {
    assert.strictEqual(pluralize('bus'), 'buses');
    assert.strictEqual(pluralize('box'), 'boxes');
    assert.strictEqual(pluralize('quiz'), 'quizzes');
    assert.strictEqual(pluralize('church'), 'churches');
    assert.strictEqual(pluralize('brush'), 'brushes');
  });

  test('handles words ending in vowel + y', function(assert) {
    assert.strictEqual(pluralize('key'), 'keys');
    assert.strictEqual(pluralize('day'), 'days');
  });

  test('handles words ending in consonant + y', function(assert) {
    assert.strictEqual(pluralize('city'), 'cities');
    assert.strictEqual(pluralize('baby'), 'babies');
  });

  test('handles words ending in f/fe', function(assert) {
    assert.strictEqual(pluralize('wolf'), 'wolves');
    assert.strictEqual(pluralize('knife'), 'knives');
  });

  test('handles words ending in o', function(assert) {
    assert.strictEqual(pluralize('piano'), 'pianos');
    assert.strictEqual(pluralize('zoo'), 'zoos');
    assert.strictEqual(pluralize('hero'), 'heroes');
    assert.strictEqual(pluralize('potato'), 'potatoes');
  });

  test('does not incorrectly pluralize f/fe exceptions', function(assert) {
    assert.strictEqual(pluralize('chief'), 'chiefs'); // not "chieves"
    assert.strictEqual(pluralize('roof'), 'roofs');   // not "rooves"
  });

  test('handles regular fallback by adding s', function(assert) {
    assert.strictEqual(pluralize('car'), 'cars');
    assert.strictEqual(pluralize('book'), 'books');
  });

  // --- Casing variations ---
  test('preserves lowercase, TitleCase, and ALLCAPS casing', function(assert) {
    assert.strictEqual(pluralize('cat'), 'cats');
    assert.strictEqual(pluralize('Cat'), 'Cats');
    assert.strictEqual(pluralize('CAT'), 'CATS');
    assert.strictEqual(pluralize('MOUSE'), 'MICE');
  });

  // --- Edge cases / tricky words ---
  test('handles words ending in o', function(assert) {
    assert.strictEqual(pluralize('hero'), 'heroes');
    assert.strictEqual(pluralize('piano'), 'pianos');
  });

  test('handles Latin/Greek words in irregular list', function(assert) {
    assert.strictEqual(pluralize('cactus'), 'cacti');
    assert.strictEqual(pluralize('nucleus'), 'nuclei');
    assert.strictEqual(pluralize('syllabus'), 'syllabi');
    assert.strictEqual(pluralize('index'), 'indices');
  });
});
