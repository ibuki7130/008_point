/**
 * Validation Pipeline Configuration
 *
 * ValidationMode:
 *   off      - バリデーションなし (最速)
 *   advisory - スコア表示のみ・ブロックなし (デフォルト)
 *   strict   - 閾値未満でcorrectionPromptを返す
 *   full     - 全7層フル稼働
 */

export type ValidationMode = 'off' | 'advisory' | 'strict' | 'full';

export interface ValidationConfig {
  mode: ValidationMode;
  /** Constitutional AI 閾値 0.0-1.0 (デフォルト: 0.3) */
  constitutionalThreshold: number;
  /** Faithfulness 閾値 0.0-1.0 (デフォルト: 0.5) */
  faithfulnessThreshold: number;
  /** DeepEval 有効化 (デフォルト: false, 外部依存が必要) */
  deepEvalEnabled: boolean;
}

export function getValidationConfig(): ValidationConfig {
  const mode = (process.env.VALIDATION_MODE as ValidationMode) ?? 'advisory';
  return {
    mode,
    constitutionalThreshold: parseFloat(process.env.CONSTITUTIONAL_THRESHOLD ?? '0.3'),
    faithfulnessThreshold: parseFloat(process.env.FAITHFULNESS_THRESHOLD ?? '0.5'),
    deepEvalEnabled: process.env.DEEPEVAL_ENABLED === 'true',
  };
}
