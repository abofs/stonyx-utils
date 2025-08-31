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
  phenomenon: 'phenomena'
};

const uncountable = new Set([
  'sheep', 'fish', 'deer', 'series', 'species', 'news', 'information', 'rice'
]);

const fExceptions = new Set(['chief', 'roof', 'belief', 'chef', 'cliff']);
const oExceptions = new Set(['piano', 'photo', 'halo', 'canto', 'solo']);

function applyCasing(original, plural) {
  if (original === original.toUpperCase()) return plural.toUpperCase();
  if (original === original.toLowerCase()) return plural.toLowerCase();
  if (original[0] === original[0].toUpperCase()) {
    return plural.charAt(0).toUpperCase() + plural.slice(1);
  }
  return plural;
}

export default function pluralize(word) {
  if (typeof word !== 'string' || !/^[a-zA-Z]+$/.test(word)) {
    throw new Error('Input must be a single word containing only letters.');
  }

  const lower = word.toLowerCase();

  if (uncountable.has(lower)) return word;

  // Irregular check
  if (irregular[lower]) {
    return applyCasing(word, irregular[lower]);
  }

  // Rule-based pluralization
  if (/z$/i.test(lower)) return applyCasing(word, word + word.slice(-1) + 'es'); // quiz → quizzes
  if (/(s|x|ch|sh)$/i.test(lower)) return applyCasing(word, word + 'es');
  if (/[aeiou]y$/i.test(lower)) return applyCasing(word, word + 's');
  if (/y$/i.test(lower)) return applyCasing(word, word.slice(0, -1) + 'ies');
  if (/fe$/i.test(lower) && !fExceptions.has(lower)) return applyCasing(word, word.slice(0, -2) + 'ves');
  if (/f$/i.test(lower) && !fExceptions.has(lower)) return applyCasing(word, word.slice(0, -1) + 'ves');
  if (/o$/i.test(lower)) {
    return applyCasing(word, oExceptions.has(lower) ? word + 's' : word + 'es');
  }

  return applyCasing(word, word + 's');
}
