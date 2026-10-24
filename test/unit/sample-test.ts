import QUnit from 'qunit';

const { module, test } = QUnit;

// TODO(#54): import every test/sample/*.ts and assert on what each call produced.
module('[Unit] Samples', function () {
  module('date', function () { test.skip('TODO getTimestamp', function () {}); });
  module('object', function () { test.skip('TODO deepCopy/objToJson/makeArray/mergeObject/get/getOrSet', function () {}); });
  module('file', function () { test.skip('TODO file helpers in a mkdtemp dir', function () {}); });
  module('promise', function () { test.skip('TODO sleep under fake timers', function () {}); });
  module('prompt', function () { test.skip('TODO confirm/prompt with stream mocks', function () {}); });
  module('string', function () { test.skip('TODO case conversions, random string, pluralize', function () {}); });
  module('fuzzy-match', function () { test.skip('TODO normalize/similarity/findBestMatch', function () {}); });
});
