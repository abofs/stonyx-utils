import QUnit from 'qunit';
import sinon from 'sinon';
import { getOrSet } from '@stonyx/utils/object';

const { module, test } = QUnit;

module('[Unit] Object | getOrSet', function() {
  test('returns existing value when key is present', function(assert) {
    const map = new Map([['foo', 123]]);
    const result = getOrSet(map, 'foo', () => 456);
    assert.strictEqual(result, 123, 'Existing value should be returned');
  });

  test('sets and returns default value when key is missing (static default)', function(assert) {
    const map = new Map();
    const result = getOrSet(map, 'bar', 42);
    assert.strictEqual(result, 42, 'Default value should be returned');
    assert.strictEqual(map.get('bar'), 42, 'Default value should be stored in map');
  });

  test('sets and returns default value when key is missing (function default)', function(assert) {
    const map = new Map();
    const defaultFactory = sinon.stub().returns(new Map());
    const result = getOrSet(map, 'nested', defaultFactory);

    assert.ok(result instanceof Map, 'Factory should create a Map');
    assert.strictEqual(map.get('nested'), result, 'Created value should be stored in map');
    assert.ok(defaultFactory.calledOnce, 'Default factory should be called exactly once');
  });

  test('does not call default factory when key is already present', function(assert) {
    const existing = { x: 1 };
    const map = new Map([['foo', existing]]);
    const factory = sinon.stub().returns({ x: 2 });

    const result = getOrSet(map, 'foo', factory);
    assert.strictEqual(result, existing, 'Should return existing value');
    assert.ok(factory.notCalled, 'Factory should not be called');
  });
});
