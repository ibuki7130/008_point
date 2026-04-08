/**
 * RAG Retriever — Phase 5
 *
 * Keyword + tag-based retrieval from the in-memory index.
 * Returns top-K most relevant SnippetDocs for a given query.
 */

import { getIndex, SnippetDoc } from './indexer';

export interface RetrievalResult {
  doc: SnippetDoc;
  score: number;
}

export interface RetrieveOptions {
  topK?: number;
  minScore?: number;
}

/** Tokenize a string into lowercase words */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/** Count how many query tokens appear in the document */
function scoreDoc(doc: SnippetDoc, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const titleTokens = tokenize(doc.title);
  const bodyTokens = tokenize(doc.body.substring(0, 2000)); // score on first 2k chars
  const tagSet = new Set(doc.tags);

  let score = 0;

  for (const qt of queryTokens) {
    // Exact tag match — highest weight
    if (tagSet.has(qt)) {
      score += 3;
    }
    // Title match — medium weight
    if (titleTokens.includes(qt)) {
      score += 2;
    }
    // Body match — low weight (count occurrences, cap at 3)
    const bodyHits = Math.min(3, bodyTokens.filter(t => t === qt).length);
    score += bodyHits * 0.5;
  }

  // Normalize by query length so longer queries don't unfairly win
  return score / queryTokens.length;
}

/**
 * Retrieve the top-K most relevant documents for a query.
 *
 * @param query - Natural language query
 * @param options - topK (default 3), minScore (default 0.3)
 */
export function retrieve(
  query: string,
  options: RetrieveOptions = {}
): RetrievalResult[] {
  const { topK = 3, minScore = 0.3 } = options;

  const index = getIndex();
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) return [];

  const scored = index
    .map(doc => ({ doc, score: scoreDoc(doc, queryTokens) }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

/**
 * Retrieve and return just the doc bodies as strings.
 */
export function retrieveTexts(
  query: string,
  options: RetrieveOptions = {}
): string[] {
  return retrieve(query, options).map(r => {
    // Trim body to keep context concise (first 800 chars)
    const preview = r.doc.body.length > 800
      ? r.doc.body.substring(0, 800) + '\n...[truncated]'
      : r.doc.body;
    return `### ${r.doc.title} (${r.doc.id})\n${preview}`;
  });
}
