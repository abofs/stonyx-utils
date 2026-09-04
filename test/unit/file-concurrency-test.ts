/**
 * Concurrency coverage for `updateFile` — abofs/stonyx-utils#44.
 *
 * `updateFile` named its swap file `${filePath}.temp-${getTimestamp()}`, a
 * whole-second token. Two overlapping calls on one path inside one second
 * therefore computed the *same* swap name: writer B overwrote writer A's swap
 * bytes, A's rename moved B's payload under A's name, and B's rename threw
 * ENOENT.
 *
 * ACs are numbered per the 2026-09-04 refinement comment on the issue.
 */
import QUnit from 'qunit';

const { module, skip } = QUnit;

module('[Unit] File — updateFile concurrency (#44)', function() {
  module('AC1 — concurrent saves both resolve, file holds one whole payload', function() {
    skip('TODO: two raced updateFile calls both fulfil; content is AAAA or BBBB', function() {});
  });

  module('AC3 — the race is forced, not sampled', function() {
    skip('TODO: pinned clock + fsp.writeFile barrier; barrier entry counter === 2', function() {});
  });

  module('AC4 — swap names are unique within one millisecond', function() {
    skip('TODO: 1000 names in a tight loop under a pinned clock; Set size === 1000', function() {});
  });

  module('AC5 — uniqueness holds across processes', function() {
    skip('TODO: two spawned children x 300 updateFile calls; both exit 0', function() {});
  });

  module('AC6 — no orphan swap files, on success or failure', function() {
    skip('TODO: no *.temp-* after AC1, after AC5, and after a forced rename failure', function() {});
    skip('TODO: forced rename failure rethrows the ORIGINAL error, not the unlink error', function() {});
  });

  module('AC7 — atomicity is preserved, not traded away', function() {
    skip('TODO: poller across AC1 observes only initial/AAAA/BBBB, never a torn read', function() {});
  });
});
