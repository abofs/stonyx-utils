/**
 * Canonical usage of @stonyx/utils/fuzzy-match. Nothing runs at import time.
 *
 * FuzzyMatch reconciles names from two sources that spell them differently.
 * Entries pair two names in one `name` field, split by the delimiter
 * ("·" by default).
 */
import FuzzyMatch from '@stonyx/utils/fuzzy-match';

export function reconcileFixture(): {
  normalized: string;
  score: number;
  best: { name: string; id: number } | null;
  belowThreshold: { name: string; id: number } | null;
} {
  const matcher = new FuzzyMatch({ stopWords: ['fc'], threshold: 0.5 });
  const fixtures = [
    { name: 'Arsenal · Chelsea', id: 1 },
    { name: 'Real Madrid · Atlético Madrid', id: 2 },
  ];

  // Accents and punctuation are stripped, case folded, stop words removed.
  const normalized = matcher.normalize('Atlético-Madrid FC');

  // 1 for equal names, 0.9 when one contains the other, word overlap otherwise.
  const score = matcher.similarity('Real Madrid', 'Real Madrid CF');

  // Either order of the pair matches; the best entry at or above the threshold wins.
  const best = matcher.findBestMatch('Atletico Madrid', 'Real Madrid', fixtures)?.entry ?? null;
  const belowThreshold = matcher.findBestMatch('Liverpool', 'Everton', fixtures)?.entry ?? null;

  return { normalized, score, best, belowThreshold };
}
