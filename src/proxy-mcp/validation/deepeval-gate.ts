/**
 * DeepEval Gate — オプション統合 (外部依存なし版)
 *
 * enabled=false (デフォルト) の場合はスキップ。
 * enabled=true の場合は内部ヒューリスティックで評価。
 */

import { recordEvent } from '../observability';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface DeepEvalMetrics {
  hallucinationRate: number;
  answerRelevancy: number;
  contextualPrecision: number;
}

export interface DeepEvalResult {
  passed: boolean;
  hallucinationScore: number;
  skipped: boolean;
  metrics: DeepEvalMetrics;
  correctionPrompt?: string;
}

// ──────────────────────────────────────────────
// Internal Heuristics
// ──────────────────────────────────────────────

/** CoVeと同様のハルシネーション率計算 */
function computeHallucinationRate(text: string): number {
  const sentences = text
    .split(/[。．\n]|(?<=[^A-Z])\. /)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length === 0) return 0;

  let contradictions = 0;

  for (let i = 0; i < sentences.length; i++) {
    const a = sentences[i];
    const aNumbers = [...a.matchAll(/\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]));

    for (let j = i + 1; j < sentences.length; j++) {
      const b = sentences[j];
      const bNumbers = [...b.matchAll(/\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]));

      if (aNumbers.length === 0 || bNumbers.length === 0) continue;

      const aWords = a.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const bLower = b.toLowerCase();
      const shared = aWords.filter(w => bLower.includes(w));

      if (shared.length >= 2) {
        const hasConflict = aNumbers.some(an =>
          bNumbers.some(bn => bn !== an && Math.abs(bn - an) / Math.max(an, 1) > 0.1)
        );
        if (hasConflict) contradictions++;
      }
    }
  }

  const pairCount = Math.max(1, (sentences.length * (sentences.length - 1)) / 2);
  return Math.min(1.0, contradictions / pairCount);
}

/** 回答の関連性スコア: テキスト内の主要キーワード密度 */
function computeAnswerRelevancy(text: string): number {
  if (text.length === 0) return 0;

  const words = text.toLowerCase().split(/\s+|[、。！？]/).filter(w => w.length > 2);
  if (words.length === 0) return 0;

  // 重複を除いたユニーク単語率 (高いほど冗長でない)
  const uniqueWords = new Set(words);
  const diversityRatio = uniqueWords.size / words.length;

  // 長い文章ほど情報密度が低くなりがち
  const lengthPenalty = Math.max(0, 1 - text.length / 5000);

  return Math.min(1.0, diversityRatio * 0.6 + lengthPenalty * 0.4);
}

/** 数値・固有名詞の根拠あり率 */
function computeContextualPrecision(text: string): number {
  const sentences = text
    .split(/[。．\n]|(?<=[^A-Z])\. /)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length === 0) return 1.0;

  const specificClaims = sentences.filter(s =>
    /\d+/.test(s) || /[A-Z][a-z]{2,}/.test(s)
  );

  if (specificClaims.length === 0) return 1.0;

  // 具体的な数値・固有名詞を含む文の割合が高すぎると
  // 根拠なき主張のリスクが上がる (逆説的に低スコア)
  const specificRatio = specificClaims.length / sentences.length;
  return Math.max(0.3, 1 - specificRatio * 0.3);
}

// ──────────────────────────────────────────────
// Correction Prompt
// ──────────────────────────────────────────────

function buildCorrectionPrompt(metrics: DeepEvalMetrics): string {
  const issues: string[] = [];

  if (metrics.hallucinationRate > 0.2) {
    issues.push(`ハルシネーション率が高い (${(metrics.hallucinationRate * 100).toFixed(0)}%): 数値・固有名詞の矛盾を確認してください`);
  }
  if (metrics.answerRelevancy < 0.5) {
    issues.push(`回答関連性が低い (${(metrics.answerRelevancy * 100).toFixed(0)}%): 冗長な表現を削減してください`);
  }
  if (metrics.contextualPrecision < 0.5) {
    issues.push(`文脈精度が低い (${(metrics.contextualPrecision * 100).toFixed(0)}%): 根拠のある主張のみ記述してください`);
  }

  return `DeepEval品質チェックで以下の問題が検出されました:\n${issues.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
}

// ──────────────────────────────────────────────
// Main API
// ──────────────────────────────────────────────

/**
 * DeepEval ゲートを実行する
 */
export function runDeepEvalGate(
  text: string,
  options: { enabled?: boolean; contextId?: string } = {}
): DeepEvalResult {
  const {
    enabled = process.env.DEEPEVAL_ENABLED === 'true',
    contextId = 'deepeval',
  } = options;

  if (!enabled) {
    return {
      passed: true,
      hallucinationScore: 0,
      skipped: true,
      metrics: {
        hallucinationRate: 0,
        answerRelevancy: 1.0,
        contextualPrecision: 1.0,
      },
    };
  }

  const hallucinationRate = computeHallucinationRate(text);
  const answerRelevancy = computeAnswerRelevancy(text);
  const contextualPrecision = computeContextualPrecision(text);

  const hallucinationScore = hallucinationRate;
  const passed = hallucinationScore < 0.3 && answerRelevancy >= 0.4;

  const metrics: DeepEvalMetrics = {
    hallucinationRate,
    answerRelevancy,
    contextualPrecision,
  };

  recordEvent('memory_search', contextId, passed ? 'ok' : 'fail', {
    metadata: { hallucinationScore, ...metrics },
  });

  return {
    passed,
    hallucinationScore,
    skipped: false,
    metrics,
    correctionPrompt: !passed ? buildCorrectionPrompt(metrics) : undefined,
  };
}
