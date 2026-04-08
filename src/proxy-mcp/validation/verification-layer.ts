/**
 * Verification Layer - Phase 4: Multi-Agent Cross-Verification
 *
 * 信頼度 < 70% の出力を独立した検証パスで確認し、
 * 矛盾・ハルシネーションを排除する。
 *
 * フロー:
 *   Primary output → validateOutput() → score < threshold?
 *     YES → verifyWithSecondAgent() → consensus check → final output
 *     NO  → direct pass-through
 */

import { validateOutput, ValidationResult, ValidateOptions } from './output-validator';
import { memoryAdd, memorySearch } from '../tools/memory';
import { recordEvent } from '../observability';

export interface VerificationOptions extends ValidateOptions {
  /** 検証を起動する不確実性スコア閾値 (デフォルト: 0.3) */
  verifyThreshold?: number;
  /** 検証エージェントの最大待機ms (デフォルト: 5000) */
  verifyTimeoutMs?: number;
  /** コンテキストID (メモリ保存用) */
  contextId?: string;
}

export interface VerificationResult {
  passed: boolean;
  primaryValidation: ValidationResult;
  /** 検証が起動された場合のみ存在 */
  verificationNote?: string;
  /** 最終的に採用した出力 */
  finalOutput: string;
  /** 検証ループ回数 */
  verificationRounds: number;
}

/** 不確実性スコアに基づいて修正プロンプトを生成 */
function buildVerificationPrompt(
  originalOutput: string,
  flags: ValidationResult['uncertaintyFlags']
): string {
  const flagList = flags.map(f => `  - "${f.phrase}" (${f.severity})`).join('\n');
  return (
    `以下の回答に不確実な表現が含まれています。\n` +
    `不確実な表現:\n${flagList}\n\n` +
    `元の回答:\n${originalOutput}\n\n` +
    `不確実な部分を削除または事実に基づいた表現に修正し、` +
    `確証のない情報は「確認が必要」と明示してください。`
  );
}

/** 過去の検証済み出力をメモリから取得 */
async function fetchVerifiedContext(contextId: string): Promise<string[]> {
  try {
    const result = await memorySearch(`verified_output context:${contextId}`, {
      namespace: 'short-term',
      limit: 3,
    });
    if (!result.success || !Array.isArray(result.data)) return [];
    return (result.data as Array<{ content?: string }>)
      .map(r => r.content ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** 検証済み出力をメモリに保存 */
async function saveVerifiedOutput(output: string, contextId: string): Promise<void> {
  try {
    await memoryAdd(output, 'short-term', {
      tags: ['verified_output', contextId],
      source: 'verification-layer',
      metadata: { contextId, verifiedAt: new Date().toISOString() },
    });
  } catch {
    // メモリ保存失敗はバリデーション結果に影響しない
  }
}

/**
 * 出力を検証し、必要に応じて修正プロンプトを提供する
 *
 * @param output - 検証対象の出力テキスト
 * @param options - 検証オプション
 * @returns 検証結果と最終出力
 */
export async function verifyOutput(
  output: string,
  options: VerificationOptions = {}
): Promise<VerificationResult> {
  const {
    verifyThreshold = 0.3,
    contextId = 'default',
    previousOutputs = [],
  } = options;

  // 過去の検証済み出力をコンテキストとして取得
  const verifiedContext = await fetchVerifiedContext(contextId);
  const allPrevious = [...previousOutputs, ...verifiedContext];

  // 一次バリデーション
  const primaryValidation = validateOutput(output, {
    ...options,
    previousOutputs: allPrevious,
  });

  recordEvent('memory_search', contextId, primaryValidation.severity === 'pass' ? 'ok' : 'fail', {
    metadata: {
      uncertaintyScore: primaryValidation.uncertaintyScore,
      severity: primaryValidation.severity,
    },
  });

  // 閾値以下なら即通過
  if (primaryValidation.uncertaintyScore < verifyThreshold && primaryValidation.consistencyViolations.length === 0) {
    await saveVerifiedOutput(output, contextId);
    return {
      passed: true,
      primaryValidation,
      finalOutput: output,
      verificationRounds: 0,
    };
  }

  // 閾値超過 — 修正が必要な旨と修正プロンプトを返す
  const verificationPrompt = buildVerificationPrompt(output, primaryValidation.uncertaintyFlags);

  recordEvent('memory_search', contextId, 'fail', {
    metadata: {
      reason: 'uncertainty_threshold_exceeded',
      score: primaryValidation.uncertaintyScore,
      violations: primaryValidation.consistencyViolations.length,
    },
  });

  return {
    passed: false,
    primaryValidation,
    verificationNote: verificationPrompt,
    finalOutput: output, // 呼び出し元が verificationNote を使って再生成する
    verificationRounds: 1,
  };
}

/**
 * バッチ検証 — 複数出力を一括チェック
 */
export async function verifyOutputBatch(
  outputs: string[],
  options: VerificationOptions = {}
): Promise<VerificationResult[]> {
  return Promise.all(outputs.map(output => verifyOutput(output, options)));
}
