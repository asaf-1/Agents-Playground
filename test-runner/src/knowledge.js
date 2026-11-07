// "Similar known problems": the retrieval half of RAG, with no model.
//
// For a failed test, find the notes most likely to explain it. The notes are
// the planted bugs (knowledge-base.json, built from practice.js by
// scripts/test-runner/build-knowledge.js) and the failure categories
// (triage.js). The ranking is BM25, the classic search-engine formula: a word
// counts for more when it is rare across the notes and when it appears in a
// short note, and repeating it has diminishing returns. That is the whole
// algorithm - no embeddings, no network, nothing to install - which is why it
// runs on a 512 MB free host and why every score can be explained.
//
// Retrieval only: nothing here writes an answer. The page shows the notes and
// a person reads them. A model could be put on top later (the "generation"
// half of RAG); this file is the part that would feed it.

// The planted-bug notes (built from practice.js), and the failure categories.
const KNOWLEDGE = require("./knowledge-base.json");
const { CATEGORIES } = require("./triage.js");

// BM25's two knobs, at the values most search engines ship with.
const K1 = 1.2;
const B = 0.75;

// How many notes to return, and the score below which a match is noise.
const DEFAULT_LIMIT = 3;
const MIN_SCORE = 1.5;
const RELATIVE_FLOOR = 0.4;

// Words that appear in nearly every failure and so say nothing about which
// one: assertion plumbing, stack-trace furniture, and English glue.
const STOPWORDS = new Set(
  `a an and are as at be been but by can could did do does for from had has
  have he her his how i if in into is it its just may more must no not of on
  one only or our out over she so some than that the their them then there
  these they this those to too two up us was we were what when where which
  while who why will with would you your
  error expect expected received tobe toequal value call log line test tests
  spec ts js check checks at await async page true false null undefined
  e2e app`
    .split(/\s+/)
    .filter(Boolean),
);

// "bankStaleBalance" -> "bank Stale Balance"; "getByTestId" -> "get By Test Id".
function splitCamel(text) {
  return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

// A light stemmer: enough that "transfer", "transfers" and "transferred"
// meet, not a linguistic one. Short words are left alone.
function stem(word) {
  if (word.length <= 4) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 6) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("es") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// A text's search words: camelCase split, lower case, no punctuation or
// stopwords, no plain numbers except status codes, each one stemmed.
function tokenize(text) {
  if (typeof text !== "string" || !text) return [];

  return splitCamel(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .filter((word) => !/^\d+$/.test(word) || /^[1-5]\d\d$/.test(word))
    .map(stem);
}

// A field repeated n times weighs n times as much in BM25's term counts, which
// is the simplest honest way to say "the title matters more than the hint".
function weighted(parts) {
  const tokens = [];

  // Each part's words, repeated by its weight.
  for (const [text, weight] of parts) {
    const words = tokenize(text);

    for (let i = 0; i < weight; i += 1) tokens.push(...words);
  }

  return tokens;
}

// The spec files' names without .spec.ts, as words.
function specWords(files) {
  return (Array.isArray(files) ? files : [])
    .map((file) =>
      String(file)
        .split("/")
        .pop()
        .replace(/\.spec\.ts$/, ""),
    )
    .join(" ");
}

// A planted bug as a search document: what to show the reader, and its words,
// the title counting most.
function faultDocument(note) {
  return {
    id: note.id,
    kind: "fault",
    title: note.title,
    meaning: note.meaning,
    detail: `${note.family} · ${note.verdict === "HEAL" ? "the test should adapt" : "a real fault to report"} · ${note.where}`,
    flag: note.flag,
    verdict: note.verdict,
    tokens: weighted([
      [note.title, 3],
      [note.flag, 2],
      [note.family, 1],
      [note.where, 1],
      [note.meaning, 1],
      [note.hint, 1],
      [specWords(note.specs), 1],
    ]),
  };
}

// A failure category as a search document, its name and keywords counting most.
function categoryDocument(category) {
  return {
    id: `category:${category.id}`,
    kind: "category",
    title: category.label,
    meaning: category.meaning,
    detail: category.fix,
    category: category.id,
    tokens: weighted([
      [category.label, 3],
      [category.id.replace(/-/g, " "), 2],
      [category.keywords, 2],
      [category.meaning, 1],
      [category.fix, 1],
    ]),
  };
}

// The search index: each document's word counts and length, how many documents
// hold each word, and the average length.
function buildIndex(documents) {
  // Count each document's words.
  const docs = documents.map((doc) => {
    const counts = new Map();

    for (const token of doc.tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }

    return { ...doc, counts, length: doc.tokens.length };
  });
  const documentFrequency = new Map();

  // How many documents hold each word.
  for (const doc of docs) {
    for (const token of doc.counts.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  // The average length, for BM25's length adjustment.
  const averageLength =
    docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(docs.length, 1);

  return { docs, documentFrequency, averageLength, size: docs.length };
}

// The index, built once: every planted bug and every category but Unclassified.
const INDEX = buildIndex([
  ...(Array.isArray(KNOWLEDGE.notes) ? KNOWLEDGE.notes : []).map(faultDocument),
  ...CATEGORIES.filter((category) => category.id !== "unknown").map(
    categoryDocument,
  ),
]);

// Inverse document frequency, BM25's "+1" form, which is never negative.
function idf(index, token) {
  const df = index.documentFrequency.get(token) || 0;

  return Math.log(1 + (index.size - df + 0.5) / (df + 0.5));
}

// One document's BM25 score for the query's words.
function scoreDocument(index, doc, queryTokens) {
  let score = 0;

  for (const token of queryTokens) {
    const tf = doc.counts.get(token);
    if (!tf) continue;

    // Rare words and short documents count for more; a repeated word counts
    // less each time.
    const norm = K1 * (1 - B + (B * doc.length) / index.averageLength);
    score += idf(index, token) * ((tf * (K1 + 1)) / (tf + norm));
  }

  return score;
}

// The words a failure is searched by: its title, the spec's file name, and the
// error with the stack trace taken off (file paths and line numbers there
// match every note equally and so only add noise).
function failureQuery(failure) {
  // The error without its stack-trace lines, up to 600 characters.
  const message =
    typeof failure.message === "string"
      ? failure.message
          .split("\n")
          .filter((line) => !/^\s*at\s/.test(line))
          .join(" ")
          .slice(0, 600)
      : "";

  // The title, the spec's name and the error, as one query.
  return [failure.title, specWords([failure.file]), message]
    .filter(Boolean)
    .join(" ");
}

// The best few notes for a query: scored, the weak ones dropped, and only those
// within 40% of the best.
function search(query, options = {}) {
  // How many to return, and the lowest score that counts.
  const limit = Number.isInteger(options.limit) ? options.limit : DEFAULT_LIMIT;
  const minScore = Number.isFinite(options.minScore)
    ? options.minScore
    : MIN_SCORE;
  // Each distinct word once: a message that repeats "transfer" five times is
  // not five times as much about transfers.
  const tokens = [...new Set(tokenize(query))];

  // No usable words: nothing.
  if (!tokens.length) return [];

  // Leave out what the caller excludes, score the rest, keep those strong
  // enough, best first.
  const exclude = new Set(
    Array.isArray(options.exclude) ? options.exclude : [],
  );
  const ranked = INDEX.docs
    .filter((doc) => !exclude.has(doc.id))
    .map((doc) => ({ doc, score: scoreDocument(INDEX, doc, tokens) }))
    .filter((hit) => hit.score >= minScore)
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));
  // A match far weaker than the best one is noise beside it, not a second
  // opinion: it shares a word or two and nothing else.
  const floor = ranked.length ? ranked[0].score * RELATIVE_FLOOR : 0;

  // The top ones, each with its score to one decimal.
  return ranked
    .filter((hit) => hit.score >= floor)
    .slice(0, limit)
    .map(({ doc, score }) => ({
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      meaning: doc.meaning,
      detail: doc.detail,
      score: Math.round(score * 10) / 10,
    }));
}

// The notes for one failure.
function similarProblems(failure, options) {
  return search(failureQuery(failure || {}), options);
}

// What the app and the tests use.
module.exports = {
  search,
  similarProblems,
  failureQuery,
  tokenize,
  noteCount: INDEX.size,
};
