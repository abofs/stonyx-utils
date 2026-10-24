/**
 * Canonical usage of @stonyx/utils/date. Nothing runs at import time.
 */
import { getTimestamp } from '@stonyx/utils/date';

/** UNIX seconds for now, and for a given Date (milliseconds are floored away). */
export function timestamps(when: Date): { now: number; at: number } {
  return {
    now: getTimestamp(),
    at: getTimestamp(when),
  };
}
