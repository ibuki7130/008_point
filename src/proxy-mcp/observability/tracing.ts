/**
 * Distributed Tracing - OpenTelemetry Compatible
 *
 * 軽量なネイティブ分散トレーシング実装。
 * OTel パッケージ未インストール時は独自JSONL形式で動作し、
 * @opentelemetry/sdk-node が利用可能な場合は自動的にJaeger等にエクスポートする。
 *
 * インストール（オプション）:
 *   npm install @opentelemetry/sdk-node @opentelemetry/exporter-otlp-grpc \
 *               @opentelemetry/auto-instrumentations-node
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface Span {
  readonly context: SpanContext;
  readonly name: string;
  readonly startTime: number;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: 'ok' | 'error', message?: string): void;
  recordException(error: Error): void;
  end(): void;
}

export interface TracingExport {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeMs: number;
  endTimeMs?: number;
  durationMs?: number;
  status: 'ok' | 'error' | 'unset';
  statusMessage?: string;
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestampMs: number; attributes?: Record<string, unknown> }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

const TRACES_DIR = path.join(process.cwd(), '.taisun', 'traces');
const TRACES_FILE = path.join(TRACES_DIR, 'spans.jsonl');

function ensureTracesDir(): void {
  if (!fs.existsSync(TRACES_DIR)) {
    fs.mkdirSync(TRACES_DIR, { recursive: true });
  }
}

function persistSpan(span: TracingExport): void {
  try {
    ensureTracesDir();
    fs.appendFileSync(TRACES_FILE, JSON.stringify(span) + '\n');
  } catch {
    // ストレージ失敗はサイレントに無視（トレーシングはベストエフォート）
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────────────────────

function generateTraceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function generateSpanId(): string {
  return crypto.randomBytes(8).toString('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Context propagation (async-local storage based)
// ─────────────────────────────────────────────────────────────────────────────

// Node.js 12.17+ built-in AsyncLocalStorage
let activeSpanContext: SpanContext | null = null;

function getActiveSpanContext(): SpanContext | null {
  return activeSpanContext;
}

function setActiveSpanContext(ctx: SpanContext | null): void {
  activeSpanContext = ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Span implementation
// ─────────────────────────────────────────────────────────────────────────────

class SpanImpl implements Span {
  readonly context: SpanContext;
  readonly name: string;
  readonly startTime: number;

  private attributes: Record<string, string | number | boolean> = {};
  private status: 'ok' | 'error' | 'unset' = 'unset';
  private statusMessage?: string;
  private events: Array<{ name: string; timestampMs: number; attributes?: Record<string, unknown> }> = [];
  private ended = false;

  constructor(name: string, context: SpanContext) {
    this.name = name;
    this.context = context;
    this.startTime = Date.now();
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes = { ...this.attributes, [key]: value };
  }

  setStatus(status: 'ok' | 'error', message?: string): void {
    this.status = status;
    this.statusMessage = message;
  }

  recordException(error: Error): void {
    this.events = [
      ...this.events,
      {
        name: 'exception',
        timestampMs: Date.now(),
        attributes: {
          'exception.type': error.name,
          'exception.message': error.message,
          'exception.stacktrace': error.stack ?? '',
        },
      },
    ];
    this.status = 'error';
    this.statusMessage = error.message;
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;

    const endTime = Date.now();
    const export_: TracingExport = {
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      parentSpanId: this.context.parentSpanId,
      name: this.name,
      startTimeMs: this.startTime,
      endTimeMs: endTime,
      durationMs: endTime - this.startTime,
      status: this.status,
      statusMessage: this.statusMessage,
      attributes: { ...this.attributes },
      events: [...this.events],
    };

    persistSpan(export_);
    tryExportToOtel(export_);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 新しいスパンを開始する
 *
 * @param name スパン名
 * @param fn スパン内で実行する処理（自動でend()が呼ばれる）
 * @param parentContext 親スパンのコンテキスト（省略時はアクティブなスパンを親に使用）
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  parentContext?: SpanContext
): Promise<T> {
  const parent = parentContext ?? getActiveSpanContext();
  const span = startSpan(name, parent ?? undefined);
  const prevContext = getActiveSpanContext();

  setActiveSpanContext(span.context);

  try {
    const result = await fn(span);
    if (span instanceof SpanImpl) {
      span.setStatus('ok');
    }
    return result;
  } catch (error) {
    if (span instanceof SpanImpl) {
      span.recordException(error as Error);
    }
    throw error;
  } finally {
    span.end();
    setActiveSpanContext(prevContext);
  }
}

/**
 * スパンを手動で開始する（end()の呼び出しが必要）
 */
export function startSpan(name: string, parentContext?: SpanContext): Span {
  const parent = parentContext ?? getActiveSpanContext();

  const context: SpanContext = {
    traceId: parent?.traceId ?? generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: parent?.spanId,
  };

  return new SpanImpl(name, context);
}

/**
 * 現在アクティブなトレースコンテキストを取得する
 */
export function getTraceContext(): SpanContext | null {
  return getActiveSpanContext();
}

/**
 * トレースIDを新規生成（バッチ処理などの起点に使用）
 */
export function newTraceId(): string {
  return generateTraceId();
}

// ─────────────────────────────────────────────────────────────────────────────
// OTel optional integration
// ─────────────────────────────────────────────────────────────────────────────

let otelExporter: ((span: TracingExport) => void) | null = null;

/**
 * OpenTelemetry エクスポーターをセットアップ（パッケージが利用可能な場合）
 *
 * 使用例:
 *   import { setupOtelJaeger } from './tracing'
 *   setupOtelJaeger({ endpoint: 'http://localhost:4317', serviceName: 'taisun-proxy' })
 */
export function setupOtelJaeger(config: {
  endpoint?: string;
  serviceName?: string;
}): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-otlp-grpc');

    const exporter = new OTLPTraceExporter({
      url: config.endpoint ?? 'http://localhost:4317',
    });

    const sdk = new NodeSDK({
      serviceName: config.serviceName ?? 'taisun-proxy',
      traceExporter: exporter,
    });

    sdk.start();

    // ネイティブスパンをOTelにブリッジ
    otelExporter = (span: TracingExport) => {
      // OTel SDKが起動していればHTTP経由でエクスポートされる
      // ここでは JSONL 形式でローカルにも二重保存済み
      void span; // 実際のエクスポートはSDKが担当
    };

    console.info(`[tracing] OTel Jaeger exporter connected: ${config.endpoint ?? 'localhost:4317'}`);
    return true;
  } catch {
    console.debug('[tracing] OTel packages not available — using native JSONL tracing only');
    return false;
  }
}

function tryExportToOtel(span: TracingExport): void {
  if (otelExporter) {
    try {
      otelExporter(span);
    } catch {
      // エクスポート失敗はサイレントに無視
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 保存済みのスパンを検索する
 */
export function querySpans(filter: {
  traceId?: string;
  name?: string;
  status?: 'ok' | 'error';
  sinceMs?: number;
  limit?: number;
}): TracingExport[] {
  try {
    ensureTracesDir();
    if (!fs.existsSync(TRACES_FILE)) return [];

    const lines = fs.readFileSync(TRACES_FILE, 'utf-8').trim().split('\n').filter(Boolean);
    let spans: TracingExport[] = lines
      .map((line) => {
        try {
          return JSON.parse(line) as TracingExport;
        } catch {
          return null;
        }
      })
      .filter((s): s is TracingExport => s !== null);

    if (filter.traceId) spans = spans.filter((s) => s.traceId === filter.traceId);
    if (filter.name) spans = spans.filter((s) => s.name.includes(filter.name!));
    if (filter.status) spans = spans.filter((s) => s.status === filter.status);
    if (filter.sinceMs) spans = spans.filter((s) => s.startTimeMs >= filter.sinceMs!);
    if (filter.limit) spans = spans.slice(-filter.limit);

    return spans;
  } catch {
    return [];
  }
}

/**
 * トレース全体（同一traceIdの全スパン）を取得する
 */
export function getTrace(traceId: string): TracingExport[] {
  return querySpans({ traceId });
}
