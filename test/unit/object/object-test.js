import Qunit from 'qunit';
import { mergeObject } from '@stonyx/utils/object';

const { module, test } = Qunit;

module('[Unit] Object | mergeObject', function() {
  test('works as expected', async function(assert) {
    assert.deepEqual(
      mergeObject({ a: 1, b: 2 }, { c: 3 }),
      { a: 1, b: 2, c: 3 },
      'New properties are added'
    );

    assert.deepEqual(
      mergeObject({ a: 1, b: 2, c: 3 }, { c: 4 }),
      { a: 1, b: 2, c: 4 },
      'Old properties are overwritten'
    );

    assert.deepEqual(
      mergeObject({ a: 1, b: 2, c: 3 }, { a: 7, c: 23, d: { a: 1, b: 2, c: 3 } }),
      { a: 7, b: 2, c: 23, d: { a: 1, b: 2, c: 3 } },
      'Objects are merged recursively'
    );

    try {
      mergeObject([], {});
    } catch {
      assert.ok(true, 'Array inputs throws error');
    }
  });

  test('does not share references (copy-safe)', async function(assert) {
    const source1 = { a: { nested: 1 } };
    const source2 = { b: { nested: 2 } };

    const result = mergeObject(source1, source2);

    // Mutate result
    result.a.nested = 99;
    result.b.nested = 77;

    assert.notEqual(result.a.nested, source1.a.nested, 'Changing result does not affect source1');
    assert.notEqual(result.b.nested, source2.b.nested, 'Changing result does not affect source2');
  });

  test('respects ignoreNewKeys option', async function(assert) {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 3, c: 4 };

    const result = mergeObject(obj1, obj2, { ignoreNewKeys: true });

    assert.deepEqual(
      result,
      { a: 1, b: 3 },
      'New keys from obj2 are ignored, but existing keys are overwritten'
    );
  });

  test('ignores new keys recursively when ignoreNewKeys is true', async function(assert) {
    const obj1 = { a: { x: 1, y: 2 } };
    const obj2 = { a: { y: 3, z: 4 } };

    const result = mergeObject(obj1, obj2, { ignoreNewKeys: true });

    assert.deepEqual(
      result,
      { a: { x: 1, y: 3 } },
      'New nested key "z" from obj2 is ignored'
    );
  });
});