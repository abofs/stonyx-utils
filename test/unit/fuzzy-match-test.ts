import QUnit from 'qunit';
import FuzzyMatch from '@stonyx/utils/fuzzy-match';

const { module, test } = QUnit;

module('[Unit] FuzzyMatch | normalize', function() {
  test('lowercases and strips accents', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.normalize('Atlético Madrid'), 'atletico madrid');
  });

  test('removes special characters', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.normalize('FC Bayern (München)'), 'fc bayern munchen');
  });

  test('collapses whitespace', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.normalize('  Real   Madrid  '), 'real madrid');
  });

  test('filters stop words', function(assert) {
    const fm = new FuzzyMatch({ stopWords: ['fc', 'sc'] });
    assert.strictEqual(fm.normalize('FC Barcelona'), 'barcelona');
    assert.strictEqual(fm.normalize('SC Freiburg'), 'freiburg');
  });

  test('returns empty string for empty input', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.normalize(''), '');
  });
});

module('[Unit] FuzzyMatch | similarity', function() {
  test('exact match returns 1.0', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.similarity('Real Madrid', 'Real Madrid'), 1.0);
  });

  test('case-insensitive exact match returns 1.0', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.similarity('real madrid', 'REAL MADRID'), 1.0);
  });

  test('accent-insensitive exact match returns 1.0', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.similarity('Atlético', 'Atletico'), 1.0);
  });

  test('substring match returns 0.9', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.similarity('Manchester United FC', 'Manchester United'), 0.9);
  });

  test('empty string returns 0', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.similarity('', 'test'), 0);
    assert.strictEqual(fm.similarity('test', ''), 0);
  });

  test('no common words returns 0', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.similarity('Barcelona', 'Liverpool'), 0);
  });

  test('partial word overlap via prefix returns fractional score', function(assert) {
    const fm = new FuzzyMatch();
    const score = fm.similarity('Man Utd', 'Manchester United');
    assert.ok(score > 0 && score < 1, `expected fractional score, got ${score}`);
  });

  test('word overlap produces meaningful score', function(assert) {
    const fm = new FuzzyMatch();
    const score = fm.similarity('Real Madrid CF', 'Real Madrid');
    assert.ok(score > 0.5, `expected high score, got ${score}`);
  });
});

module('[Unit] FuzzyMatch | findBestMatch', function() {
  const entries = [
    { name: 'Real Madrid·FC Barcelona', id: 1 },
    { name: 'Liverpool·Manchester City', id: 2 },
    { name: 'Bayern München·Borussia Dortmund', id: 3 },
  ];

  test('finds exact pair match', function(assert) {
    const fm = new FuzzyMatch();
    const result = fm.findBestMatch('Real Madrid', 'FC Barcelona', entries);
    assert.ok(result !== null);
    assert.strictEqual(result!.entry.id, 1);
    assert.ok(result!.score >= 0.9);
  });

  test('finds reversed pair match', function(assert) {
    const fm = new FuzzyMatch();
    const result = fm.findBestMatch('FC Barcelona', 'Real Madrid', entries);
    assert.ok(result !== null);
    assert.strictEqual(result!.entry.id, 1);
  });

  test('returns null when no match above threshold', function(assert) {
    const fm = new FuzzyMatch();
    const result = fm.findBestMatch('PSG', 'Marseille', entries);
    assert.strictEqual(result, null);
  });

  test('respects custom threshold', function(assert) {
    const fm = new FuzzyMatch({ threshold: 0.99 });
    const result = fm.findBestMatch('Real Madrid', 'Barcelona', entries);
    assert.strictEqual(result, null);
  });

  test('per-call threshold overrides instance threshold', function(assert) {
    const fm = new FuzzyMatch({ threshold: 0.01 });
    const result = fm.findBestMatch('PSG', 'Marseille', entries, 0.99);
    assert.strictEqual(result, null);
  });

  test('skips entries without exactly 2 parts', function(assert) {
    const fm = new FuzzyMatch();
    const badEntries = [{ name: 'Only One Team', id: 99 }];
    const result = fm.findBestMatch('Only', 'One Team', badEntries);
    assert.strictEqual(result, null);
  });

  test('handles accent normalization in matching', function(assert) {
    const fm = new FuzzyMatch();
    const result = fm.findBestMatch('Bayern Munchen', 'Borussia Dortmund', entries);
    assert.ok(result !== null);
    assert.strictEqual(result!.entry.id, 3);
  });

  test('works with custom delimiter', function(assert) {
    const fm = new FuzzyMatch({ delimiter: ' vs ' });
    const customEntries = [{ name: 'Chelsea vs Arsenal', id: 10 }];
    const result = fm.findBestMatch('Chelsea', 'Arsenal', customEntries);
    assert.ok(result !== null);
    assert.strictEqual(result!.entry.id, 10);
  });

  test('returns empty for empty entries array', function(assert) {
    const fm = new FuzzyMatch();
    const result = fm.findBestMatch('A', 'B', []);
    assert.strictEqual(result, null);
  });

  test('preserves generic entry type in result', function(assert) {
    const fm = new FuzzyMatch();
    const typedEntries = [{ name: 'Real Madrid·FC Barcelona', id: 1, extra: 'data' }];
    const result = fm.findBestMatch('Real Madrid', 'FC Barcelona', typedEntries);
    assert.ok(result !== null);
    assert.strictEqual(result!.entry.extra, 'data');
  });
});

module('[Unit] FuzzyMatch | constructor defaults', function() {
  test('default threshold is 0.35', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.threshold, 0.35);
  });

  test('default delimiter is middle dot', function(assert) {
    const fm = new FuzzyMatch();
    assert.strictEqual(fm.delimiter, '\u00B7');
  });

  test('default stopWords is empty', function(assert) {
    const fm = new FuzzyMatch();
    assert.deepEqual(fm.stopWords, []);
  });

  test('accepts custom options', function(assert) {
    const fm = new FuzzyMatch({ stopWords: ['fc'], delimiter: '|', threshold: 0.5 });
    assert.deepEqual(fm.stopWords, ['fc']);
    assert.strictEqual(fm.delimiter, '|');
    assert.strictEqual(fm.threshold, 0.5);
  });
});
