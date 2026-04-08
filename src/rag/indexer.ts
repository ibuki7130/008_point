/**
 * RAG Indexer — Phase 5
 *
 * Scans .claude/skills / *.md and project CLAUDE.md files,
 * extracts text + tags, and builds an in-memory index.
 *
 * Index is rebuilt lazily (once per process, or forced via reindex()).
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SnippetDoc {
  id: string;
  source: string;        // file path
  title: string;         // first # heading
  body: string;          // full text content
  tags: string[];        // derived from headings, frontmatter, filename
  indexedAt: string;
}

const SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills');
const PROJECT_ROOT = process.cwd();

// Candidate CLAUDE.md locations to always include
const STATIC_DOCS: string[] = [
  path.join(PROJECT_ROOT, '.claude', 'CLAUDE.md'),
  path.join(PROJECT_ROOT, '.claude', 'references', 'CLAUDE-L2.md'),
  path.join(PROJECT_ROOT, '.claude', 'references', 'CLAUDE-L3.md'),
  path.join(PROJECT_ROOT, 'AGENTS.md'),
];

let _index: SnippetDoc[] | null = null;

/** Extract title from markdown (first # heading or filename) */
function extractTitle(content: string, filePath: string): string {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : path.basename(filePath, '.md');
}

/** Derive tags from markdown headings and filename */
function extractTags(content: string, filePath: string): string[] {
  const tags = new Set<string>();

  // Add filename as tag
  const base = path.basename(filePath, '.md').toLowerCase();
  base.split(/[-_/]/).filter(Boolean).forEach(t => tags.add(t));

  // Add ## headings as tags
  const headings = content.match(/^##\s+(.+)/gm) || [];
  for (const h of headings) {
    h.replace(/^##\s+/, '')
      .toLowerCase()
      .split(/[\s\-_/]+/)
      .filter(t => t.length > 2)
      .forEach(t => tags.add(t));
  }

  return [...tags];
}

/** Index a single markdown file */
function indexFile(filePath: string): SnippetDoc | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const body = fs.readFileSync(filePath, 'utf-8').trim();
    if (body.length < 30) return null;

    return {
      id: filePath.replace(PROJECT_ROOT, '').replace(/\\/g, '/'),
      source: filePath,
      title: extractTitle(body, filePath),
      body,
      tags: extractTags(body, filePath),
      indexedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Scan .claude/skills for CLAUDE.md and SKILL.md files */
function scanSkillDocs(): SnippetDoc[] {
  const docs: SnippetDoc[] = [];

  if (!fs.existsSync(SKILLS_DIR)) return docs;

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(SKILLS_DIR, entry.name);

    for (const docName of ['CLAUDE.md', 'SKILL.md', 'README.md']) {
      const docPath = path.join(skillDir, docName);
      const doc = indexFile(docPath);
      if (doc) docs.push(doc);
    }
  }

  return docs;
}

/**
 * Build or return cached index.
 */
export function getIndex(force = false): SnippetDoc[] {
  if (_index && !force) return _index;

  const docs: SnippetDoc[] = [];

  // Static project docs
  for (const p of STATIC_DOCS) {
    const doc = indexFile(p);
    if (doc) docs.push(doc);
  }

  // Skill docs
  docs.push(...scanSkillDocs());

  _index = docs;
  return _index;
}

/**
 * Force rebuild of the index.
 */
export function reindex(): SnippetDoc[] {
  return getIndex(true);
}

/**
 * Returns index statistics.
 */
export function indexStats(): { total: number; sources: string[] } {
  const idx = getIndex();
  return {
    total: idx.length,
    sources: idx.map(d => d.id),
  };
}
