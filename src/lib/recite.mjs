// Matching logic for "Recite from memory".
// Pure functions only, so they can be tested without a browser.

// Turn Uthmani text (or speech-recognition output) into plain comparable letters.
export function normalize(s) {
  return s
    .replace(/ىٰ/g, 'ى')                 // alif maqsura + dagger alif → alif maqsura
    .replace(/\u0670/g, 'ا')             // dagger alif is pronounced, so keep it as alif
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0640]/g, '') // harakat, Quranic marks, tatweel
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// Ayahs that open with disjointed letters, which are recited by letter name.
const INITIALS = new Set([
  '2:1', '3:1', '7:1', '10:1', '11:1', '12:1', '13:1', '14:1', '15:1', '19:1', '20:1', '26:1',
  '27:1', '28:1', '29:1', '30:1', '31:1', '32:1', '36:1', '38:1', '40:1', '41:1', '42:1', '42:2',
  '43:1', '44:1', '45:1', '46:1', '50:1', '68:1',
]);
const LETTER_NAMES = {
  'ا': 'الف', 'ل': 'لام', 'م': 'ميم', 'ص': 'صاد', 'ر': 'را', 'ك': 'كاف', 'ه': 'ها', 'ي': 'يا',
  'ع': 'عين', 'ط': 'طا', 'س': 'سين', 'ح': 'حا', 'ق': 'قاف', 'ن': 'نون',
};

const HAS_LETTER = /[\u0621-\u063A\u0641-\u064A\u0671]/;

// Split an ayah into words to recite. Pause marks stay attached to the word before them.
export function tokenize(ar, key) {
  const words = [];
  for (const tok of ar.split(/\s+/).filter(Boolean)) {
    if (!HAS_LETTER.test(tok) && words.length) { words[words.length - 1].display += ' ' + tok; continue; }
    const plain = normalize(tok).replace(/\s/g, '');
    words.push({ display: tok, plain, targets: [plain], maxN: 2 });
  }
  if (key && INITIALS.has(key) && words.length) {
    const w = words[0];
    const names = [...w.plain].map((c) => LETTER_NAMES[c] ?? c);
    w.targets = [names.join(''), w.plain];
    w.maxN = names.length + 1;
    w.initials = true;
  }
  return words;
}

// Does the spoken text starting at word i say the expected word?
// Returns how many spoken words were used (0 = no match).
// A missing or extra prefix letter (wa-, fa-, bi-, li-, ka-) changes the meaning, so it is never forgiven.
const PREFIXES = 'وفبلك';
function prefixDiffers(a, b) {
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  if (long.length === short.length + 1 && PREFIXES.includes(long[0]) && long.slice(1) === short) return true;
  // same length, different first letter, and one of them is a prefix letter (li- vs al-, wa- vs fa-)
  return a.length === b.length && a[0] !== b[0] && (PREFIXES.includes(a[0]) || PREFIXES.includes(b[0])) && a.slice(1) === b.slice(1);
}

export function wordMatches(said, target, threshold) {
  if (said === target) return true;
  if (prefixDiffers(said, target)) return false;
  // Very short words must be exact unless the reader chose "lenient".
  if (target.length <= 3 && threshold > THRESHOLDS.lenient) return false;
  return similarity(said, target) >= threshold;
}

// Does the speech starting at spoken[i] say words[next]?
// Speech engines sometimes split one word in two or join two words into one,
// so this also tries 2 spoken words for 1 written word, and 1 spoken word for 2 written words.
// Returns { n, e }: spoken words used and written words matched. { n: 0 } means no match.
export function matchAt(spoken, i, words, next, threshold) {
  const w = words[next];
  for (let n = 1; n <= w.maxN && i + n <= spoken.length; n++) {
    const said = spoken.slice(i, i + n).join('');
    if (w.targets.some((t) => wordMatches(said, t, threshold))) return { n, e: 1 };
  }
  const w2 = words[next + 1];
  if (w2 && !w.initials && !w2.initials && spoken[i]) {
    if (wordMatches(spoken[i], w.plain + w2.plain, threshold)) return { n: 1, e: 2 };
  }
  return { n: 0, e: 0 };
}

export const THRESHOLDS = { strict: 0.85, normal: 0.7, lenient: 0.55 };
