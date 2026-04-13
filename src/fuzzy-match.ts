/**
 * Generic fuzzy string matching for cross-source reconciliation.
 * Handles Unicode normalization, stop-word filtering, and word-set similarity scoring.
 */

export interface FuzzyMatchOptions {
  stopWords?: string[];
  delimiter?: string;
  threshold?: number;
}

export interface FuzzyMatchResult<T extends { name: string }> {
  entry: T;
  score: number;
}

function normalizeString(name: string, stopWords: string[] = []): string {
  let result = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');

  if (stopWords.length) {
    const pattern = new RegExp(`\\b(${stopWords.join('|')})\\b`, 'g');
    result = result.replace(pattern, '');
  }

  return result.replace(/\s+/g, ' ').trim();
}

function wordSet(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter(w => w.length > 1));
}

export default class FuzzyMatch {
  stopWords: string[];
  delimiter: string;
  threshold: number;

  constructor(options: FuzzyMatchOptions = {}) {
    this.stopWords = options.stopWords || [];
    this.delimiter = options.delimiter || '\u00B7';
    this.threshold = options.threshold || 0.35;
  }

  normalize(name: string): string {
    return normalizeString(name, this.stopWords);
  }

  similarity(nameA: string, nameB: string): number {
    const aN = this.normalize(nameA);
    const sN = this.normalize(nameB);

    if (!aN || !sN) return 0;
    if (aN === sN) return 1.0;
    if (aN.includes(sN) || sN.includes(aN)) return 0.9;

    const aWords = wordSet(aN);
    const sWords = wordSet(sN);
    if (aWords.size === 0 || sWords.size === 0) return 0;

    let overlap = 0;
    for (const w of aWords) {
      if (sWords.has(w)) {
        overlap++;
      } else {
        for (const sw of sWords) {
          if (sw.startsWith(w) || w.startsWith(sw)) {
            overlap += 0.7;
            break;
          }
        }
      }
    }

    return overlap / Math.max(aWords.size, sWords.size);
  }

  findBestMatch<T extends { name: string }>(nameA: string, nameB: string, entries: T[], threshold?: number): FuzzyMatchResult<T> | null {
    const minScore = threshold ?? this.threshold;
    let bestMatch: T | null = null;
    let bestScore = 0;

    for (const entry of entries) {
      const parts = entry.name.split(this.delimiter);
      if (parts.length !== 2) continue;

      const [entryA, entryB] = parts;
      const normalScore = (this.similarity(nameA, entryA) + this.similarity(nameB, entryB)) / 2;
      const reversedScore = (this.similarity(nameA, entryB) + this.similarity(nameB, entryA)) / 2;
      const score = Math.max(normalScore, reversedScore);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    return bestScore >= minScore && bestMatch ? { entry: bestMatch, score: bestScore } : null;
  }
}
