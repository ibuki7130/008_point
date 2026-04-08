/**
 * Faithfulness Check
 *
 * RAG出力とソース文書の忠実度チェック。
 * 数値・固有名詞・日付を含む文をクレームとして抽出し、
 * ソーステキストとの整合性を確認する。
 */

import { recordEvent } from '../observability';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface FaithfulnessResult {
  passed: boolean;
  faithfulnessScore: number;
  unsupportedClaims: string[];
  contradictedClaims: string[];
  correctionPrompt?: string;
}

export interface FaithfulnessOptions {
  threshold?: number;
  contextId?: string;
}

// ──────────────────────────────────────────────
// Number Normalization (BUG-007修正)
// ──────────────────────────────────────────────

/** 英語サフィックス (k/M/B/T) や日本語単位 (万/億/兆) を含む数値表現を正規数値に変換 */
function parseNormalizedNumber(raw: string): number {
  const s = raw.trim();
  // 英語サフィックス: 200k, 1.5M, 3B, 2T
  const engMatch = s.match(/^([\d,]+(?:\.\d+)?)([kKmMbBtT])$/);
  if (engMatch) {
    const base = parseFloat(engMatch[1].replace(/,/g, ''));
    const suffixes: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
    return base * (suffixes[engMatch[2].toLowerCase()] ?? 1);
  }
  // 日本語単位: 500万, 3億, 1.5兆, 1千万
  const jpMatch = s.match(/^([\d,]+(?:\.\d+)?)(万|億|兆|千|百)/);
  if (jpMatch) {
    const base = parseFloat(jpMatch[1].replace(/,/g, ''));
    const units: Record<string, number> = { 万: 1e4, 億: 1e8, 兆: 1e12, 千: 1e3, 百: 1e2 };
    return base * (units[jpMatch[2]] ?? 1);
  }
  // 通常数値（コンマ区切り含む）
  return parseFloat(s.replace(/,/g, ''));
}

/** テキストから数値表現（英語サフィックス・日本語単位含む）を全て抽出して正規化 */
function extractNumbers(text: string): number[] {
  // 日本語単位付き / 英語サフィックス付き / 通常数値 の順でマッチ
  const pattern = /[\d,]+(?:\.\d+)?(?:[kKmMbBtT万億兆千百])?/g;
  return [...text.matchAll(pattern)]
    .map(m => parseNormalizedNumber(m[0]))
    .filter(n => !isNaN(n));
}

// ──────────────────────────────────────────────
// Claim Extraction
// ──────────────────────────────────────────────

/** 数値・固有名詞・日付を含む文をクレームとして抽出 */
function extractVerifiableClaims(text: string): string[] {
  const sentences = text
    .split(/[。．\n]|(?<=[^A-Z])\. /)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  return sentences.filter(sentence => {
    // BUG-007修正: 英語サフィックス・日本語単位付き数値も検出
    const hasNumbers = /\d+(?:[kKmMbBtT万億兆千百])?/.test(sentence);
    const hasDate = /20\d{2}年?|[0-9]{1,2}月[0-9]{1,2}日/.test(sentence);
    const hasProperNoun = /[A-Z][a-z]{2,}|Claude|GPT|Google|Microsoft|Anthropic|OpenAI/.test(sentence);
    return hasNumbers || hasDate || hasProperNoun;
  });
}

// ──────────────────────────────────────────────
// Support Check
// ──────────────────────────────────────────────

/** クレームがソーステキストのいずれかに根拠があるか確認 */
function isClaimSupported(claim: string, sourceTexts: string[]): boolean {
  const claimWords = claim
    .toLowerCase()
    .split(/\s+|[、。！？]/)
    .filter(w => w.length > 2);

  // BUG-007修正: 正規化数値で比較
  const claimNumbers = extractNumbers(claim);

  for (const source of sourceTexts) {
    const sourceLower = source.toLowerCase();

    // 数値の一致確認（正規化数値で比較）
    if (claimNumbers.length > 0) {
      const sourceNumbers = extractNumbers(source);
      const allNumbersFound = claimNumbers.every(cn =>
        sourceNumbers.some(sn => Math.abs(sn - cn) / Math.max(Math.abs(cn), 1) < 0.01)
      );
      if (allNumbersFound) return true;
    }

    // キーワードの重複確認
    const matchedWords = claimWords.filter(w => sourceLower.includes(w));
    const overlapRatio = matchedWords.length / Math.max(claimWords.length, 1);
    if (overlapRatio >= 0.5) return true;
  }

  return false;
}

/** クレームがソーステキストと矛盾するか確認 */
function isClaimContradicted(claim: string, sourceTexts: string[]): boolean {
  // BUG-007修正: 正規化数値で比較
  const claimNumbers = extractNumbers(claim);
  if (claimNumbers.length === 0) return false;

  const claimWords = claim
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3);

  for (const source of sourceTexts) {
    const sourceSentences = source.split(/[。．\n]/).filter(s => s.length > 10);

    for (const sentence of sourceSentences) {
      const sentenceWords = sentence.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const shared = claimWords.filter(w => sentenceWords.includes(w));

      if (shared.length >= 2) {
        const sourceNumbers = extractNumbers(sentence);
        if (sourceNumbers.length > 0 && claimNumbers.length > 0) {
          const hasConflict = claimNumbers.some(cn =>
            sourceNumbers.some(sn => {
              if (sn === cn) return false;
              const maxAbs = Math.max(Math.abs(sn), Math.abs(cn));
              if (maxAbs < 1e-9) return false;
              return Math.abs(sn - cn) / maxAbs > 0.1;
            })
          );
          if (hasConflict) return true;
        }
      }
    }
  }

  return false;
}

// ──────────────────────────────────────────────
// Correction Prompt
// ──────────────────────────────────────────────

function buildCorrectionPrompt(
  unsupported: string[],
  contradicted: string[]
): string {
  const lines: string[] = ['以下の忠実度の問題が検出されました。\n'];

  if (unsupported.length > 0) {
    lines.push('【根拠なし】以下の主張はソースに根拠がありません:');
    unsupported.forEach((c, i) => lines.push(`  ${i + 1}. "${c.substring(0, 80)}..."`));
    lines.push('');
  }

  if (contradicted.length > 0) {
    lines.push('【矛盾】以下の主張はソースと矛盾しています:');
    contradicted.forEach((c, i) => lines.push(`  ${i + 1}. "${c.substring(0, 80)}..."`));
    lines.push('');
  }

  lines.push('ソーステキストに基づいて上記の主張を修正してください。');
  return lines.join('\n');
}

// ──────────────────────────────────────────────
// Main API
// ──────────────────────────────────────────────

/**
 * RAG出力の忠実度チェックを実行する
 */
export function checkFaithfulness(
  generatedText: string,
  sourceTexts: string[],
  options: FaithfulnessOptions = {}
): FaithfulnessResult {
  const { threshold = 0.5, contextId = 'faithfulness' } = options;

  // ソースなし: 検証不要
  if (sourceTexts.length === 0) {
    return {
      passed: true,
      faithfulnessScore: 1.0,
      unsupportedClaims: [],
      contradictedClaims: [],
    };
  }

  const claims = extractVerifiableClaims(generatedText);

  if (claims.length === 0) {
    return {
      passed: true,
      faithfulnessScore: 1.0,
      unsupportedClaims: [],
      contradictedClaims: [],
    };
  }

  const unsupportedClaims: string[] = [];
  const contradictedClaims: string[] = [];

  for (const claim of claims) {
    if (isClaimContradicted(claim, sourceTexts)) {
      contradictedClaims.push(claim);
    } else if (!isClaimSupported(claim, sourceTexts)) {
      unsupportedClaims.push(claim);
    }
  }

  const unfaithfulCount = unsupportedClaims.length + contradictedClaims.length;
  const unfaithfulnessRate = unfaithfulCount / claims.length;
  const faithfulnessScore = Math.max(0, 1 - unfaithfulnessRate);
  const passed = faithfulnessScore >= threshold;

  recordEvent('memory_search', contextId, passed ? 'ok' : 'fail', {
    metadata: {
      faithfulnessScore,
      totalClaims: claims.length,
      unsupportedCount: unsupportedClaims.length,
      contradictedCount: contradictedClaims.length,
    },
  });

  return {
    passed,
    faithfulnessScore,
    unsupportedClaims,
    contradictedClaims,
    correctionPrompt: unfaithfulCount > 0
      ? buildCorrectionPrompt(unsupportedClaims, contradictedClaims)
      : undefined,
  };
}
