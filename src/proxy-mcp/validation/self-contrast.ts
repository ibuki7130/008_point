/**
 * Self-Contrast — 複数視点の差分検出
 *
 * 同一テキスト内で矛盾を検出する強化版。
 * numerical / logical / temporal / factual の4タイプを検出。
 * kuromoji による日本語形態素解析で日本語文に対応（BUG-008修正）。
 */

import * as kuromoji from 'kuromoji';
import { recordEvent } from '../observability';

// ──────────────────────────────────────────────
// kuromoji Tokenizer Singleton (lazy init)
// ──────────────────────────────────────────────

type KuromojiTokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

let _tokenizerPromise: Promise<KuromojiTokenizer> | null = null;

function getTokenizer(): Promise<KuromojiTokenizer> {
  if (!_tokenizerPromise) {
    _tokenizerPromise = new Promise<KuromojiTokenizer>((resolve, reject) => {
      kuromoji
        .builder({ dicPath: 'node_modules/kuromoji/dict' })
        .build((err, tokenizer) => {
          if (err) reject(err);
          else resolve(tokenizer);
        });
    });
  }
  return _tokenizerPromise;
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface Contradiction {
  claimA: string;
  claimB: string;
  contradictionType: 'numerical' | 'logical' | 'temporal' | 'factual';
  confidence: number;
}

export interface SelfContrastResult {
  passed: boolean;
  contrastScore: number;
  contradictions: Contradiction[];
  correctionPrompt?: string;
}

// ──────────────────────────────────────────────
// Sentence Extraction
// ──────────────────────────────────────────────

function extractSentences(text: string): string[] {
  return text
    .split(/[。．\n]|(?<=[^A-Z])\. /)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

/**
 * BUG-008修正: kuromoji形態素解析で共有キーワードを抽出。
 * tokenizer が未初期化の場合はスペース分割にフォールバック。
 */
function getSharedKeywords(
  a: string,
  b: string,
  tokenizer?: KuromojiTokenizer
): string[] {
  if (tokenizer) {
    const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '形容動詞']);
    const extractTokens = (text: string): string[] =>
      tokenizer.tokenize(text)
        .filter(t => CONTENT_POS.has(t.pos) && (t.basic_form || t.surface_form).length > 1)
        .map(t => t.basic_form && t.basic_form !== '*' ? t.basic_form : t.surface_form);
    const aTokens = extractTokens(a);
    const bSet = new Set(extractTokens(b));
    return aTokens.filter(w => bSet.has(w));
  }
  // Fallback: スペース/句読点分割（非日本語テキスト or 初期化失敗時）
  const aWords = a.toLowerCase().split(/\s+|[、。！？]/).filter(w => w.length > 2);
  const bLower = b.toLowerCase();
  return aWords.filter(w => bLower.includes(w));
}

// ──────────────────────────────────────────────
// Contradiction Detectors
// ──────────────────────────────────────────────

function detectNumerical(sentences: string[], tokenizer?: KuromojiTokenizer): Contradiction[] {
  const results: Contradiction[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const a = sentences[i];
    const aNumbers = [...a.matchAll(/\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]));
    if (aNumbers.length === 0) continue;

    for (let j = i + 1; j < sentences.length; j++) {
      const b = sentences[j];
      const bNumbers = [...b.matchAll(/\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]));
      if (bNumbers.length === 0) continue;

      const shared = getSharedKeywords(a, b, tokenizer);
      if (shared.length < 2) continue;

      const hasConflict = aNumbers.some(an =>
        bNumbers.some(
          bn => bn !== an && Math.abs(bn - an) / Math.max(an, 1) > 0.1
        )
      );

      if (hasConflict) {
        results.push({
          claimA: a.substring(0, 120),
          claimB: b.substring(0, 120),
          contradictionType: 'numerical',
          confidence: Math.min(0.9, 0.5 + shared.length * 0.1),
        });
      }
    }
  }

  return results;
}

function detectLogical(sentences: string[], tokenizer?: KuromojiTokenizer): Contradiction[] {
  const results: Contradiction[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const a = sentences[i];

    for (let j = i + 1; j < sentences.length; j++) {
      const b = sentences[j];
      const shared = getSharedKeywords(a, b, tokenizer);
      if (shared.length < 2) continue;

      const aAffirm = /はBだ|できる|である|です|あります|存在する/.test(a);
      const bNegate = /はBではない|できない|ではない|ありません|存在しない/.test(b);
      const aNegate = /はBではない|できない|ではない|ありません|存在しない/.test(a);
      const bAffirm = /はBだ|できる|である|です|あります|存在する/.test(b);

      if ((aAffirm && bNegate) || (aNegate && bAffirm)) {
        results.push({
          claimA: a.substring(0, 120),
          claimB: b.substring(0, 120),
          contradictionType: 'logical',
          confidence: 0.7,
        });
      }
    }
  }

  return results;
}

function detectTemporal(sentences: string[], tokenizer?: KuromojiTokenizer): Contradiction[] {
  const results: Contradiction[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const a = sentences[i];
    const aPast = /昨年|去年|以前|過去/.test(a);
    const aFuture = /来年|将来|今後|未来/.test(a);

    if (!aPast && !aFuture) continue;

    for (let j = i + 1; j < sentences.length; j++) {
      const b = sentences[j];
      const bPast = /昨年|去年|以前|過去/.test(b);
      const bFuture = /来年|将来|今後|未来/.test(b);

      const shared = getSharedKeywords(a, b, tokenizer);
      if (shared.length < 2) continue;

      if ((aPast && bFuture) || (aFuture && bPast)) {
        results.push({
          claimA: a.substring(0, 120),
          claimB: b.substring(0, 120),
          contradictionType: 'temporal',
          confidence: 0.75,
        });
      }
    }
  }

  return results;
}

function detectFactual(sentences: string[], tokenizer?: KuromojiTokenizer): Contradiction[] {
  const results: Contradiction[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const a = sentences[i];

    for (let j = i + 1; j < sentences.length; j++) {
      const b = sentences[j];
      const shared = getSharedKeywords(a, b, tokenizer);
      if (shared.length < 2) continue;

      const aPositive = /できる|可能|サポート|対応/.test(a);
      const bNegative = /できない|不可能|未対応|非対応/.test(b);
      const aNegative = /できない|不可能|未対応|非対応/.test(a);
      const bPositive = /できる|可能|サポート|対応/.test(b);

      if ((aPositive && bNegative) || (aNegative && bPositive)) {
        results.push({
          claimA: a.substring(0, 120),
          claimB: b.substring(0, 120),
          contradictionType: 'factual',
          confidence: 0.65,
        });
      }
    }
  }

  return results;
}

// ──────────────────────────────────────────────
// Correction Prompt
// ──────────────────────────────────────────────

function buildCorrectionPrompt(contradictions: Contradiction[]): string {
  const items = contradictions.map((c, i) =>
    `${i + 1}. [${c.contradictionType}] 信頼度: ${(c.confidence * 100).toFixed(0)}%\n` +
    `   A: "${c.claimA}"\n` +
    `   B: "${c.claimB}"`
  ).join('\n\n');

  return (
    `以下の自己矛盾が検出されました。\n\n${items}\n\n` +
    `各矛盾を解消し、テキスト全体で一貫した主張になるよう修正してください。`
  );
}

// ──────────────────────────────────────────────
// Main API
// ──────────────────────────────────────────────

/** 処理する最大文数（O(N²)爆発防止） */
const MAX_SENTENCES = 50;

/**
 * 自己矛盾チェックを実行する（BUG-008修正: kuromoji非同期初期化対応）
 */
export async function runSelfContrast(
  text: string,
  options: { threshold?: number; contextId?: string } = {}
): Promise<SelfContrastResult> {
  const { threshold = 0.5, contextId = 'self-contrast' } = options;

  // kuromoji tokenizer を取得（失敗時は undefined でフォールバック）
  let tokenizer: KuromojiTokenizer | undefined;
  try {
    tokenizer = await getTokenizer();
  } catch {
    // フォールバック: スペース分割で処理継続
  }

  // O(N²)爆発防止: 先頭 MAX_SENTENCES 文のみ処理
  const sentences = extractSentences(text).slice(0, MAX_SENTENCES);

  const contradictions: Contradiction[] = [
    ...detectNumerical(sentences, tokenizer),
    ...detectLogical(sentences, tokenizer),
    ...detectTemporal(sentences, tokenizer),
    ...detectFactual(sentences, tokenizer),
  ];

  const totalPairs = Math.max(1, (sentences.length * (sentences.length - 1)) / 2);
  const contradictionRatio = contradictions.length / totalPairs;
  const contrastScore = Math.max(0, 1 - contradictionRatio * 5);
  const passed = contrastScore >= threshold;

  recordEvent('memory_search', contextId, passed ? 'ok' : 'fail', {
    metadata: {
      contrastScore,
      contradictionCount: contradictions.length,
      sentenceCount: sentences.length,
    },
  });

  return {
    passed,
    contrastScore,
    contradictions,
    correctionPrompt: contradictions.length > 0
      ? buildCorrectionPrompt(contradictions)
      : undefined,
  };
}
