import QUnit from 'qunit';
import sinon from 'sinon';
import { get } from '@stonyx/utils/object';

const { module, test } = QUnit;

module('[Unit] Object | get', function() {
  test('retrieves top-level property', function(assert) {
    const obj = { a: 1 };
    assert.strictEqual(get(obj, 'a'), 1);
  });

  test('retrieves nested property', function(assert) {
    const obj = { a: { b: { c: 42 } } };
    assert.strictEqual(get(obj, 'a.b.c'), 42);
  });

  test('returns null for missing top-level property', function(assert) {
    const obj = { a: 1 };
    assert.strictEqual(get(obj, 'b'), null);
  });

  test('returns null for missing nested property', function(assert) {
    const obj = { a: { b: 2 } };
    assert.strictEqual(get(obj, 'a.b.c'), null);
  });

  test('returns null if path points to undefined property', function(assert) {
    const obj = { a: { b: undefined } };
    assert.strictEqual(get(obj, 'a.b'), null);
  });

  test('logs error if called with only one argument (failing case)', function(assert) {
    const spy = sinon.spy(console, 'error');
    get({ a: 1 });
    assert.ok(spy.calledOnceWith('Get must be called with two arguments; an object and a property key.'));
    spy.restore();
  });

  test('logs error if object is null/undefined (failing case)', function(assert) {
    const spy = sinon.spy(console, 'error');
    get(null, 'a');
    assert.ok(spy.calledOnceWith(`Cannot call get with 'a' on an undefined object.`));
    spy.restore();
  });

  test('logs error if path is not a string (failing case)', function(assert) {
    const spy = sinon.spy(console, 'error');
    get({ a: 1 }, 123);
    assert.ok(spy.calledOnceWith('The path provided to get must be a string.'));
    spy.restore();
  });
});
