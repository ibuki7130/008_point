/**
 * Saga Orchestrator - 補償トランザクション（Compensating Transactions）
 *
 * 長時間タスクのエラーリカバリにおける冪等性保証を提供する。
 * 各ステップが失敗した際に補償アクション（undo操作）を逆順で実行し、
 * 部分的な実行状態を安全にロールバックする。
 *
 * 使用例:
 *   const saga = new SagaOrchestrator('deploy-pipeline')
 *   saga.addStep({
 *     name: 'build',
 *     execute: async () => await buildArtifacts(),
 *     compensate: async () => await cleanBuildArtifacts(),
 *     idempotencyKey: 'build-v1.2.3',
 *   })
 *   await saga.run()
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SagaStep<T = unknown> {
  /** ステップの識別名 */
  name: string;
  /** 実行する処理 */
  execute: () => Promise<T>;
  /** 補償アクション（失敗時にステップの効果を元に戻す） */
  compensate: () => Promise<void>;
  /**
   * 冪等性キー — 同じキーのステップはスキップされる（再実行対策）
   * 省略時は自動生成（毎回実行される）
   */
  idempotencyKey?: string;
  /** タイムアウト（ms）。省略時は30秒 */
  timeoutMs?: number;
  /** リトライ回数（補償は対象外）。省略時は0 */
  retries?: number;
}

export type SagaStatus = 'pending' | 'running' | 'completed' | 'compensating' | 'failed' | 'compensated';

export interface SagaStepResult {
  name: string;
  status: 'skipped' | 'completed' | 'failed' | 'compensated';
  idempotencyKey?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  retryCount: number;
}

export interface SagaState {
  sagaId: string;
  name: string;
  status: SagaStatus;
  startedAt: string;
  completedAt?: string;
  steps: SagaStepResult[];
  currentStep: number;
  error?: string;
  compensationStartedAt?: string;
  compensationCompletedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

const SAGA_DIR = path.join(process.cwd(), '.taisun', 'sagas');

function ensureSagaDir(): void {
  if (!fs.existsSync(SAGA_DIR)) {
    fs.mkdirSync(SAGA_DIR, { recursive: true });
  }
}

function saveSagaState(state: SagaState): void {
  ensureSagaDir();
  const file = path.join(SAGA_DIR, `${state.sagaId}.json`);
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function loadSagaState(sagaId: string): SagaState | null {
  const file = path.join(SAGA_DIR, `${sagaId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as SagaState;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency cache
// ─────────────────────────────────────────────────────────────────────────────

const IDEM_FILE = path.join(SAGA_DIR, 'idempotency.json');

function loadIdempotencyCache(): Record<string, { completedAt: string }> {
  ensureSagaDir();
  if (!fs.existsSync(IDEM_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(IDEM_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function markIdempotent(key: string): void {
  const cache = loadIdempotencyCache();
  const updated = { ...cache, [key]: { completedAt: new Date().toISOString() } };
  fs.writeFileSync(IDEM_FILE, JSON.stringify(updated, null, 2));
}

function isAlreadyExecuted(key: string): boolean {
  const cache = loadIdempotencyCache();
  return key in cache;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout wrapper
// ─────────────────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, stepName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Step "${stepName}" timed out after ${ms}ms`)),
      ms
    );
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SagaOrchestrator
// ─────────────────────────────────────────────────────────────────────────────

export class SagaOrchestrator {
  private readonly sagaId: string;
  private readonly sagaName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private steps: SagaStep<any>[] = [];

  constructor(name: string, sagaId?: string) {
    this.sagaName = name;
    this.sagaId = sagaId ?? `saga_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  get id(): string {
    return this.sagaId;
  }

  /**
   * ステップを追加する（追加順に実行される）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addStep<T = any>(step: SagaStep<T>): this {
    this.steps = [...this.steps, step];
    return this;
  }

  /**
   * Sagaを実行する
   *
   * - 各ステップを順番に実行
   * - 失敗した場合、完了済みステップを逆順に補償
   * - 冪等性キーがある場合、既実行ステップはスキップ
   * - 中断後の再開に対応（前回の状態を復元）
   */
  async run(): Promise<SagaState> {
    // 前回の状態があれば復元（再開）
    const existingState = loadSagaState(this.sagaId);
    const state: SagaState = existingState ?? {
      sagaId: this.sagaId,
      name: this.sagaName,
      status: 'pending',
      startedAt: new Date().toISOString(),
      steps: [],
      currentStep: 0,
    };

    if (state.status === 'completed' || state.status === 'compensated') {
      return state;
    }

    state.status = 'running';
    saveSagaState(state);

    const completedSteps: number[] = [];

    for (let i = state.currentStep; i < this.steps.length; i++) {
      const step = this.steps[i];
      const idemKey = step.idempotencyKey;

      const stepResult: SagaStepResult = state.steps[i] ?? {
        name: step.name,
        status: 'skipped',
        idempotencyKey: idemKey,
        startedAt: new Date().toISOString(),
        retryCount: 0,
      };

      // 冪等性チェック
      if (idemKey && isAlreadyExecuted(idemKey)) {
        stepResult.status = 'skipped';
        state.steps[i] = stepResult;
        state.currentStep = i + 1;
        completedSteps.push(i);
        saveSagaState(state);
        continue;
      }

      const maxRetries = step.retries ?? 0;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const startMs = Date.now();
          stepResult.startedAt = new Date().toISOString();
          stepResult.retryCount = attempt;

          await withTimeout(
            step.execute(),
            step.timeoutMs ?? 30_000,
            step.name
          );

          stepResult.status = 'completed';
          stepResult.completedAt = new Date().toISOString();
          stepResult.durationMs = Date.now() - startMs;
          stepResult.error = undefined;
          lastError = null;

          if (idemKey) markIdempotent(idemKey);

          break;
        } catch (error) {
          lastError = error as Error;
          stepResult.error = lastError.message;
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }

      state.steps[i] = stepResult;

      if (lastError) {
        // ステップ失敗 → 補償フェーズへ
        state.status = 'compensating';
        state.error = `Step "${step.name}" failed: ${lastError.message}`;
        state.compensationStartedAt = new Date().toISOString();
        saveSagaState(state);

        await this.compensate(state, completedSteps);
        return loadSagaState(this.sagaId) ?? state;
      }

      completedSteps.push(i);
      state.currentStep = i + 1;
      saveSagaState(state);
    }

    state.status = 'completed';
    state.completedAt = new Date().toISOString();
    saveSagaState(state);
    return state;
  }

  /**
   * 補償アクションを逆順で実行する
   */
  private async compensate(state: SagaState, completedStepIndices: number[]): Promise<void> {
    // 逆順で補償
    for (const idx of [...completedStepIndices].reverse()) {
      const step = this.steps[idx];
      const stepResult = state.steps[idx];

      if (!stepResult || stepResult.status === 'skipped') continue;

      try {
        await withTimeout(
          step.compensate(),
          step.timeoutMs ?? 30_000,
          `compensate:${step.name}`
        );
        state.steps[idx] = { ...stepResult, status: 'compensated' };
      } catch (error) {
        const err = error as Error;
        console.error(`[saga] Compensation failed for step "${step.name}": ${err.message}`);
        // 補償失敗はログのみ（システムが一貫性を維持できない状態 — 手動介入が必要）
        state.steps[idx] = {
          ...stepResult,
          status: 'compensated',
          error: `Original: ${stepResult.error ?? 'unknown'} | Compensation failed: ${err.message}`,
        };
      }

      saveSagaState(state);
    }

    state.status = 'compensated';
    state.compensationCompletedAt = new Date().toISOString();
    saveSagaState(state);
  }

  /**
   * Sagaの現在の状態を取得する
   */
  getState(): SagaState | null {
    return loadSagaState(this.sagaId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 完了済みSagaの一覧を取得する
 */
export function listSagas(filter?: { status?: SagaStatus; limit?: number }): SagaState[] {
  ensureSagaDir();
  try {
    const files = fs.readdirSync(SAGA_DIR)
      .filter((f) => f.endsWith('.json') && f !== 'idempotency.json');

    let sagas = files
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(SAGA_DIR, f), 'utf-8')) as SagaState;
        } catch {
          return null;
        }
      })
      .filter((s): s is SagaState => s !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    if (filter?.status) sagas = sagas.filter((s) => s.status === filter.status);
    if (filter?.limit) sagas = sagas.slice(0, filter.limit);

    return sagas;
  } catch {
    return [];
  }
}

/**
 * Saga実行を再開する（中断後の続き）
 */
export async function resumeSaga(sagaId: string, steps: SagaStep[]): Promise<SagaState> {
  const state = loadSagaState(sagaId);
  if (!state) {
    throw new Error(`Saga ${sagaId} not found`);
  }

  const orchestrator = new SagaOrchestrator(state.name, sagaId);
  steps.forEach((s) => orchestrator.addStep(s));
  return orchestrator.run();
}
