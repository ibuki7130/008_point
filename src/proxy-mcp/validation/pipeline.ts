/**
 * Validation Pipeline — 8層オーケストレーター
 *
 * Constitutional AI + Self-Contrast + CoVe + Faithfulness + DeepEval + Reflexion
 * + LLM Judge (オプション) を統合実行し、テキスト品質を一括検証する。
 */

import { getValidationConfig, ValidationMode } from './config';
import { checkConstitutional, ConstitutionalResult } from './constitutional';
import { checkFaithfulness, FaithfulnessResult } from './faithfulness';
import { runSelfContrast, SelfContrastResult } from './self-contrast';
import { runCoVe, CoVeResult } from './cove';
import { runDeepEvalGate, DeepEvalResult } from './deepeval-gate';
import { analyzeReflexionRounds, ReflexionResult } from './reflexion';
import { runLLMJudge, LLMJudgeResult } from './llm-judge';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface PipelineLayers {
  constitutional: ConstitutionalResult;
  selfContrast: SelfContrastResult;
  cove: CoVeResult;
  faithfulness: FaithfulnessResult;
  deepEval: DeepEvalResult;
  reflexion?: ReflexionResult;
  llmJudge?: LLMJudgeResult;
}

export interface PipelineResult {
  overallPassed: boolean;
  mode: ValidationMode;
  layers: PipelineLayers;
  overallScore: number;
  summary: string;
  correctionPrompt?: string;
}

export interface PipelineOptions {
  mode?: ValidationMode;
  sourceTexts?: string[];
  previousOutputs?: string[];
  contextId?: string;
}

// ──────────────────────────────────────────────
// Score Calculation
// ──────────────────────────────────────────────

function computeOverallScore(layers: PipelineLayers): number {
  const constitutionalScore = 1 - layers.constitutional.violationScore;
  const selfContrastScore = layers.selfContrast.contrastScore;
  const coveScore = 1 - layers.cove.contradictionRate;
  const faithfulnessScore = layers.faithfulness.faithfulnessScore;
  const deepEvalScore = 1 - layers.deepEval.hallucinationScore;

  // LLM Judge が有効（非スキップ）の場合はウェイトを再分配して組み込む
  if (layers.llmJudge && !layers.llmJudge.skipped) {
    return (
      constitutionalScore * 0.20 +
      selfContrastScore * 0.15 +
      coveScore * 0.15 +
      faithfulnessScore * 0.15 +
      deepEvalScore * 0.10 +
      layers.llmJudge.score * 0.25
    );
  }

  return (
    constitutionalScore * 0.25 +
    selfContrastScore * 0.20 +
    coveScore * 0.20 +
    faithfulnessScore * 0.20 +
    deepEvalScore * 0.15
  );
}

// ──────────────────────────────────────────────
// Summary Generation
// ──────────────────────────────────────────────

function buildSummary(layers: PipelineLayers, overallScore: number, passed: boolean): string {
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  const icon = passed ? '✅' : overallScore >= 0.5 ? '⚠️' : '❌';

  const judgeInfo = layers.llmJudge && !layers.llmJudge.skipped
    ? ` | LLM Judge: ${pct(layers.llmJudge.score)}`
    : '';

  return (
    `スコア: ${pct(overallScore)} ${icon} | ` +
    `Constitutional: ${pct(1 - layers.constitutional.violationScore)} | ` +
    `CoVe矛盾: ${layers.cove.contradictions.length}件 | ` +
    `忠実度: ${pct(layers.faithfulness.faithfulnessScore)}` +
    judgeInfo
  );
}

// ──────────────────────────────────────────────
// Correction Prompt Aggregation
// ──────────────────────────────────────────────

function aggregateCorrectionPrompt(layers: PipelineLayers): string | undefined {
  const prompts: string[] = [];

  if (layers.constitutional.correctionPrompt) {
    prompts.push(`## Constitutional AI\n${layers.constitutional.correctionPrompt}`);
  }
  if (layers.selfContrast.correctionPrompt) {
    prompts.push(`## Self-Contrast\n${layers.selfContrast.correctionPrompt}`);
  }
  if (layers.cove.correctionPrompt) {
    prompts.push(`## CoVe\n${layers.cove.correctionPrompt}`);
  }
  if (layers.faithfulness.correctionPrompt) {
    prompts.push(`## Faithfulness\n${layers.faithfulness.correctionPrompt}`);
  }
  if (layers.deepEval.correctionPrompt) {
    prompts.push(`## DeepEval\n${layers.deepEval.correctionPrompt}`);
  }
  if (layers.llmJudge && !layers.llmJudge.skipped && layers.llmJudge.issues.length > 0) {
    const issueLines = layers.llmJudge.issues
      .map(i => `- [${i.severity}] ${i.description}: "${i.evidence}"`)
      .join('\n');
    prompts.push(`## LLM Judge\n${issueLines}`);
  }

  return prompts.length > 0 ? prompts.join('\n\n') : undefined;
}

// ──────────────────────────────────────────────
// Off Mode — Skip all layers
// ──────────────────────────────────────────────

// BUG-001修正: sourceTexts は使用されていなかった dead parameter を削除
function buildPassedLayers(): PipelineLayers {
  return {
    constitutional: { passed: true, violationScore: 0, violations: [] },
    selfContrast: { passed: true, contrastScore: 1.0, contradictions: [] },
    cove: {
      passed: true,
      claims: [],
      questions: [],
      contradictions: [],
      contradictionRate: 0,
    },
    faithfulness: {
      passed: true,
      faithfulnessScore: 1.0,
      unsupportedClaims: [],
      contradictedClaims: [],
    },
    deepEval: {
      passed: true,
      hallucinationScore: 0,
      skipped: true,
      metrics: { hallucinationRate: 0, answerRelevancy: 1.0, contextualPrecision: 1.0 },
    },
  };
}

// ──────────────────────────────────────────────
// Main API
// ──────────────────────────────────────────────

/**
 * 7層バリデーションパイプラインを実行する
 */
export async function runValidationPipeline(
  text: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const config = getValidationConfig();
  const mode = options.mode ?? config.mode;
  const sourceTexts = options.sourceTexts ?? [];
  const previousOutputs = options.previousOutputs ?? [];
  const contextId = options.contextId ?? 'pipeline';

  // off モード: 全層スキップ
  if (mode === 'off') {
    const layers = buildPassedLayers();
    return {
      overallPassed: true,
      mode,
      layers,
      overallScore: 1.0,
      summary: 'スコア: 100% ✅ | バリデーションOFF',
    };
  }

  // 全層実行
  const constitutional = checkConstitutional(text, {
    threshold: config.constitutionalThreshold,
    contextId,
  });

  const selfContrast = await runSelfContrast(text, { contextId });

  const cove = runCoVe(text, { maxQuestions: 5, contextId });

  const faithfulness = checkFaithfulness(text, sourceTexts, {
    threshold: config.faithfulnessThreshold,
    contextId,
  });

  const deepEval = runDeepEvalGate(text, {
    enabled: config.deepEvalEnabled,
    contextId,
  });

  // Reflexion: previousOutputsがある場合のみ実行
  let reflexion: ReflexionResult | undefined;
  if (previousOutputs.length > 0) {
    reflexion = analyzeReflexionRounds([...previousOutputs, text], { contextId });
  }

  // LLM Judge: 環境変数 VALIDATION_LLM_JUDGE_ENABLED=true で有効化
  const llmJudge = await runLLMJudge(text, {
    contextId,
    sourceTexts,
  });

  const layers: PipelineLayers = {
    constitutional,
    selfContrast,
    cove,
    faithfulness,
    deepEval,
    reflexion,
    llmJudge,
  };

  const overallScore = computeOverallScore(layers);

  // mode別の合否判定
  let overallPassed: boolean;
  switch (mode) {
    case 'advisory':
      overallPassed = true;
      break;
    case 'strict':
      overallPassed = overallScore >= 0.6;
      break;
    case 'full':
      overallPassed = overallScore >= 0.7;
      break;
    default:
      overallPassed = true;
  }

  const summary = buildSummary(layers, overallScore, overallPassed);
  const correctionPrompt = !overallPassed ? aggregateCorrectionPrompt(layers) : undefined;

  return {
    overallPassed,
    mode,
    layers,
    overallScore,
    summary,
    correctionPrompt,
  };
}
