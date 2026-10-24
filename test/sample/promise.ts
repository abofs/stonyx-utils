/**
 * Canonical usage of @stonyx/utils/promise. Nothing runs at import time.
 */
import { sleep } from '@stonyx/utils/promise';

/** sleep takes seconds, not milliseconds. */
export async function retryAfter(seconds: number, attempt: () => string): Promise<string> {
  await sleep(seconds);

  return attempt();
}
