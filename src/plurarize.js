// --- Irregular nouns ---
const irregular = {
  person: 'people',
  man: 'men',
  woman: 'women',
  child: 'children',
  tooth: 'teeth',
  foot: 'feet',
  mouse: 'mice',
  goose: 'geese',
  ox: 'oxen',
  cactus: 'cacti',
  nucleus: 'nuclei',
  syllabus: 'syllabi',
  focus: 'foci',
  fungus: 'fungi',
  appendix: 'appendices',
  index: 'indices',
  criterion: 'criteria',
  phenomenon: 'phenomena',
  die: 'dice',
  thesis: 'theses',
  analysis: 'analyses',
  crisis: 'crises',
  radius: 'radii',
  corpus: 'corpora',
};

// --- Uncountables ---
const uncountable = new Set([
  'sheep', 'fish', 'deer', 'series', 'species', 'news', 'information',
  'rice', 'moose', 'bison', 'salmon', 'aircraft', 'offspring'
]);

// --- Exceptions ---
const fExceptions = new Set(['chief', 'roof', 'belief', 'chef', 'cliff', 'reef', 'proof', 'brief']);

// Keep only true irregular -o exceptions (consonant + o but take just "s")
const oExceptions = new Set(['piano', 'photo', 'halo', 'canto', 'solo']);

// --- Utility to preserve casing ---
function applyCasing(original, plural) {
  if (original === original.toUpperCase()) return plural.toUpperCase();
  if (original === original.toLowerCase()) return plural.toLowerCase();
  if (original[0] === original[0].toUpperCase()) {
    return plural.charAt(0).toUpperCase() + plural.slice(1);
  }
  return plural;
}

// --- Rule-based pluralization ---
const rules = [
  // quiz → quizzes, waltz → waltzes, topaz → topazes
  [/z$/i, w => (/iz$/i.test(w) ? w + 'zes' : w + 'es')],

  // bus → buses, box → boxes, church → churches, but stomach → stomachs (exclude -ach)
  [/(s|x|ch|sh)$/i, w => (/ach$/i.test(w) ? w + 's' : w + 'es')],

  // vowel + y → +s (key → keys)
  [/[aeiou]y$/i, w => w + 's'],

  // consonant + y → -ies (city → cities)
  [/y$/i, w => w.slice(0, -1) + 'ies'],

  // -fe → -ves (knife → knives), but not chief/roof/etc
  [/fe$/i, w => (fExceptions.has(w) ? w + 's' : w.slice(0, -2) + 'ves')],

  // -f → -ves (wolf → wolves), but not cliff/etc
  [/f$/i, w => (fExceptions.has(w) ? w + 's' : w.slice(0, -1) + 'ves')],

  // -sis → -ses (analysis → analyses, thesis → theses)
  [/sis$/i, w => w.slice(0, -2) + 'ses'],

  // vowel + o → +s (zoo → zoos, video → videos, patio → patios)
  [/[aeiou]o$/i, w => w + 's'],

  // consonant + o → usually +es, unless in oExceptions
  [/o$/i, w => (oExceptions.has(w) ? w + 's' : w + 'es')],

  // default: just +s
  [/$/i, w => w + 's']
];

// --- Exported pluralizer ---
export default function pluralize(word) {
  if (typeof word !== 'string' || !/^[a-zA-Z]+$/.test(word)) return word;

  const lower = word.toLowerCase();

  if (uncountable.has(lower)) return word;

  if (irregular[lower]) {
    return applyCasing(word, irregular[lower]);
  }

  for (const [pattern, transform] of rules) {
    if (pattern.test(lower)) {
      return applyCasing(word, transform(lower));
    }
  }

  return word; // fallback (shouldn't hit)
}
