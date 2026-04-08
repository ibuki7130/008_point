---
name: research-system
description: TAISUN v2 ディープリサーチパイプライン（全自動実行）。作りたいシステムを引数で渡すと、キーワード展開→3エージェント並列調査→omega-research→TrendScore計算→12セクションレポート→ChatGPT QA Gate（3レビュアー）→ユーザー確認待ちまでを全自動実行。外部ファイル不要・自己完結型。
version: "2.4"
argument-hint: "[BUILD_TARGET] -- 作りたいシステムを日本語で記述"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch
disable-model-invocation: false
model: sonnet
---

# research-system — TAISUN v2 ディープリサーチパイプライン v2.4

## 使い方

```
/research-system AIエージェントで商品レビューを自動収集・Slack通知するシステム
/research-system Xトレンドを毎朝収集して日次レポートを自動生成するシステム
/research-system 社内ドキュメントをベクトル検索できるRAGシステム
```

ARGUMENTS が空の場合は「何を構築したいですか？」と確認してから開始すること。

---

## パイプライン全体図

```
[BUILD_TARGET 記述]
        ↓
  PRE-FLIGHT（環境・APIキー確認）
        ↓
  STEP 1 ── キーワード展開 × 並列3本        [Claude Sonnet 4.6]
        ↓
  STEP 2 ── ディープリサーチ × 2回          [Claude Sonnet 4.6]
        ↓
  STEP 3 ── 評価・設計・実装計画            [Claude Opus 4.6]
        ↓
  STEP 4 ── 12セクション レポート生成       [Claude Opus 4.6]
        ↓
  STEP 4.5 ── QA Gate 3レビュアー           [ChatGPT 5.4 thinking / OpenRouter]
        ↓
  ユーザー確認待ち → 承認後 → 要件定義 → SDD
```

## モデル割り当て

| STEP | モデル | 理由 |
|------|--------|------|
| STEP 1〜2 | Claude Sonnet 4.6 | 大量処理・コスト最適 |
| STEP 3〜4 | Claude Opus 4.6 | 複雑な推論・高品質統合 |
| STEP 4.5 QA Gate | ChatGPT 5.4 thinking（OpenRouter） | 異なるベンダーで自己評価バイアス排除 |

## 必要な環境変数

| 変数 | 必須 | 用途 |
|------|------|------|
| ANTHROPIC_API_KEY | ✅ 必須 | Claude Sonnet/Opus（STEP 1〜4） |
| OPENROUTER_API_KEY | ✅ 必須 | ChatGPT 5.4 thinking（STEP 4.5 QA Gate） |
| XAI_API_KEY | 推奨 | /omega-research, /deep-research-grok（Grok-4） |
| TAVILY_API_KEY | 推奨 | Tavily AI検索（高精度） |
| SERPAPI_KEY | 推奨 | SerpAPI（Google検索結果取得） |
| BRAVE_SEARCH_API_KEY | 推奨 | Brave検索（広範囲Web検索）※BRAVE_API_KEYも同値で設定 |
| NEWSAPI_KEY | 推奨 | NewsAPI（ニュース集約） |
| PERPLEXITY_API_KEY | 推奨 | Perplexity AI検索+要約（omega-researchのLayer 2で使用） |
| EXA_API_KEY | 推奨 | Exa セマンティック検索（/exa-search, omega-research Layer 1） |
| ALPHA_VANTAGE_API_KEY | 推奨 | 株式・金融データ・経済指標 |
| FRED_API_KEY | 推奨 | FRED 経済指標（FF金利/CPI/失業率/GDP等） |
| APIFY_TOKEN | 推奨 | Webスクレイピング（Twitter/X/Instagram データ収集） |
| GROQ_API_KEY | 推奨 | Groq 超高速推論（バッチ処理用） |
| FIRECRAWL_API_KEY | 推奨 | /firecrawl 深層スクレイピング |
| X_BEARER_TOKEN | 推奨 | X API v2 リアルタイムトレンド（なければ HN/Bluesky 代替） |
| TWITTER_AUTH_TOKEN | 推奨 | X/Twitter Cookie認証（opencli-rs/Apify用） |
| TWITTER_CT0 | 推奨 | X/Twitter CSRF Token |
| TWITTER_COOKIES | 推奨 | X/Twitter Cookie一式 |

---

## STEP 0 — 設計書の完全読み込み（省略禁止）

以下のファイルが存在する場合、全文を分割読み込みすること。
1回のReadで全文が読めない場合は offset/limit で分割して最後まで必ず読む。

以下の2ファイルをReadツールで読み込むこと（存在する場合のみ）:

1. **全スキル網羅リサーチプロンプト**: 同ディレクトリの `all-skills-research-prompt-v1.md`
   → 18スキルの実行順序・バッチ構成・品質チェックリストを定義
2. **パイプライン設計書 v3.0**: `pipeline-design-v3.md`（存在する場合）
   → 10原則・5次元スコアリング・12セクション構成を定義

```
読み込み結果:
  全スキル網羅プロンプト: [✓ 読了 / ✗ なし]
  パイプライン設計書: [✓ 読了 / ✗ なし（なしでも続行可）]
```

**ファイルがない場合でもSTEP 1以降は実行可能。** ファイルがあれば全スキルの実行順序と品質基準が自動適用される。

---

## PRE-FLIGHT — 実行前確認

上記の環境変数を確認してから、以下を表示して開始:

```
🚀 TAISUN v2 リサーチシステム起動
   対象: [BUILD_TARGET の内容]
   モード: [XAI_API_KEY あり→omega-research / なし→mega-research-plus]
   X API: [X_BEARER_TOKEN あり→X APIトレンド取得 / なし→HN/Bluesky代替]
   モデル戦略: ハイブリッド（STEP 1-2 → Claude Sonnet 4.6 / STEP 3-4 → Claude Opus 4.6）
   QA Gate: ChatGPT 5.4 thinking（OpenRouter 経由）
   推定時間: 15〜30分
```

### パイプラインコンテキスト初期化（v2.5追加）

PRE-FLIGHT完了後、各STEPの実行前に `/tmp/taisun-pipeline/pipeline_context.json` を書き出す。
これにより mega-research/world-research/intelligence-research/omega-research が
現在のSTEP・キーワード・前STEPの発見事項・品質基準を認識して動作する。

```bash
mkdir -p /tmp/taisun-pipeline
cat > /tmp/taisun-pipeline/pipeline_context.json << 'CTXEOF'
{
  "version": "2.5",
  "pipeline": "research-system",
  "step": "PRE_FLIGHT",
  "target": "[BUILD_TARGETの内容をここに記入]",
  "keywords": [],
  "previous_findings": "",
  "scoring": {
    "accuracy": 0.90,
    "completeness": 0.93,
    "hallucination_rate": 0.05
  },
  "instructions": "research-systemパイプラインの一部として実行中。STEPコンテキストに従って動作を調整すること。"
}
CTXEOF
```

**各STEPの開始時に** `step` フィールドと `previous_findings` / `keywords` を更新すること:

```bash
# STEP 1 開始時:
python3 -c "
import json
with open('/tmp/taisun-pipeline/pipeline_context.json') as f: ctx = json.load(f)
ctx['step'] = 'STEP_1_KEYWORD_EXPANSION'
ctx['target'] = '[BUILD_TARGET]'
with open('/tmp/taisun-pipeline/pipeline_context.json', 'w') as f: json.dump(ctx, f, ensure_ascii=False, indent=2)
"

# STEP 2 開始時（キーワード結果を反映）:
python3 -c "
import json
with open('/tmp/taisun-pipeline/pipeline_context.json') as f: ctx = json.load(f)
ctx['step'] = 'STEP_2_DEEP_RESEARCH'
ctx['keywords'] = ['STEP1で展開したキーワードリスト']
ctx['previous_findings'] = 'STEP 1の要約（200文字以内）'
with open('/tmp/taisun-pipeline/pipeline_context.json', 'w') as f: json.dump(ctx, f, ensure_ascii=False, indent=2)
"
```

---

## STEP 1 — キーワード宇宙の展開

**このステップを最初に必ず実行する。**

### 1-A. キーワード展開

`/keyword-mega-extractor` スキルを使い、以下を展開:

```
「[BUILD_TARGET]」というシステムを構築するにあたって、以下を展開:
- core_keywords: コアキーワード（5〜10個）
- related: 関連キーワード（技術・ツール・概念）
- compound: 複合キーワード
- rising_2026: 2026年時点の急上昇キーワード
- niche: ニッチキーワード
- tech_stack_candidates: 技術スタック候補
- mcp_skills_needed: 必要なMCPサーバー・スキル名

結果は CSV形式 + カテゴリ別リストで出力してください。
```

APIキー不要フォールバック: `/keyword-free`

### 1-B. GIS 31ソース並列収集（background）

`run_in_background: true` で以下を同時起動:

```
/intelligence-research
```

収集対象: AI・テックニュース、経済指標（FRED 7系列）、HN、Reddit、X監視340アカウント

### 1-C. X API v2 リアルタイムトレンド

X_BEARER_TOKEN がある場合、並行実行:
- 日本語最新100件、英語高エンゲージメント、日本トレンドTOP20
- エラー時: HN Algolia API + Bluesky Firehose で代替

**STEP 1 完了後、キーワードリストを保存してから STEP 2 へ進む。**

---

## STEP 2 — ディープリサーチ（Pass 1 + Pass 2 の2回必須）

### Pass 1: 3エージェント並列（`run_in_background: true` で同時起動）

**Agent A — MCP・スキル・拡張機能の発掘**

調査先（必ず全てチェック）:
```
# MCP 公式・コア
https://github.com/modelcontextprotocol/servers   （公式MCPサーバーリスト）
https://mcp.so                                     （コミュニティMCPカタログ）
https://smithery.ai                                （MCPマーケットプレイス）

# MCP 追加ディレクトリ
https://composio.dev                               （500+MCPサーバー一元管理）
https://pulsemcp.com                               （フィルター充実MCPカタログ）
https://cursor.directory                           （Cursor向けMCP・ルールHub）
https://mcpservers.org                             （Awesome MCPサーバーキュレーション集）
https://github.com/punkpeye/awesome-mcp-servers    （コミュニティ管理MCPリスト）
https://glama.ai/mcp/servers                       （MCP追加情報）

# GitHub トレンド
https://github.com/trending?since=weekly           （週間トレンド）
https://github.com/trending?since=daily&spoken_language_code=ja （日本語日次）
https://trendshift.io                              （GitHubトレンドAPI）
https://www.gharchive.org                          （GitHub全パブリックイベントアーカイブ）
```

タスク:
1. [BUILD_TARGET] に関連するMCPサーバーを全て特定
2. Stars急増率・無料枠・認証方式・セキュリティで評価
3. TOP 20 を install コマンド付きで表形式にまとめる
4. Claude Code Skills Library から関連スキルも特定

出力: `research/agent_a_mcp.md`（**返答は500文字以内に要約してメインコンテキストへ返す**）

---

**Agent B — API・ライブラリ・SaaS・パッケージ調査**

調査先（必ず全てチェック）:
```
# API・SaaS 探索
https://apis.guru/api-list.json                    （2000+ OpenAPI仕様JSON）
https://rapidapi.com                               （API Hub）
https://www.postman.com/explore                    （Postman API Network）
https://hoppscotch.io                              （OSSのAPI開発クライアント）
https://apidog.com                                 （API設計・テスト統合）
https://public-apis.io                             （1000件以上の公開API）
https://e2b.dev/docs                               （AI開発サンドボックス実行環境）

# パッケージ・ライブラリ情報源
https://npmjs.com                                  （npm公式）
https://pypi.org                                   （PyPI公式）
https://npmtrends.com                              （npmダウンロードトレンド比較）
https://npmcharts.com                              （npmトレンド補完）
https://bundlejs.com                               （バンドルサイズ計測）
https://packagephobia.com                          （インストールサイズ比較）
https://libraries.io                               （多言語パッケージ依存関係）
https://crates.io                                  （Rust公式パッケージ）
https://pkg.go.dev                                 （Go言語公式パッケージ）

# AI・機械学習情報源
https://huggingface.co/api                         （HFモデル・データセット全メタデータAPI）
https://huggingface.co/papers                      （HF Daily Papers・最新AI論文）
https://huggingface.co/blog                        （HF公式ブログ）
https://paperswithcode.com/api/v1                  （論文・実装コード・ベンチマーク）
https://hackernoon.ai                              （HackerNoon AI特化・実践記事）

# セキュリティ・脆弱性チェック（必須）
https://osv.dev                                    （Google製OSS脆弱性DB・無制限）
https://nvd.nist.gov/developers/vulnerabilities   （NIST公式CVE/NVD REST API v2）
https://socket.dev                                 （npmサプライチェーン攻撃リスク検知）
https://security.snyk.io/vuln                      （Snyk脆弱性DB・CVSSスコア付き）
https://choosealicense.com                         （OSSライセンス確認）
```

タスク:
1. [BUILD_TARGET] に必要なAPI/ライブラリを網羅的にリストアップ
2. コスト・セキュリティ・スケーラビリティ・ライセンスで評価
3. CVE/脆弱性リスクを全候補で確認（osv.dev + socket.dev）
4. 無料枠・OSS代替の比較表
5. 採用推奨/非推奨を根拠付きで判定（コードスニペット含む）

出力: `research/agent_b_api.md` + `research/cost_breakdown.csv`（**500文字以内要約**）

---

**Agent C — アーキテクチャ・最新トレンド・コミュニティ調査**

調査先（必ず全てチェック）:
```
# コミュニティ・ソーシャル（リアルタイム）
https://hn.algolia.com/api/v1/search               （HN全投稿リアルタイム全文検索・無制限）
https://news.ycombinator.com/newest                （HN最新）
https://www.reddit.com/r/LocalLLaMA/new/           （LLM最新動向）
https://www.reddit.com/r/ClaudeAI/new/             （Claude最新）
https://docs.bsky.app                              （Bluesky Firehose API・X代替）
https://www.producthunt.com/v2/api/graphql         （新ツール日次発見）
https://hackernoon.ai                              （HackerNoon AI特化・実務者向け）

# 論文・学術
https://export.arxiv.org/api/query                 （Arxiv論文全文検索API）
https://paperswithcode.com/api/v1                  （論文+実装コード+ベンチマーク）
https://huggingface.co/papers                      （HF Daily Papers・コミュニティ注目論文）

# アーキテクチャパターン
https://microservices.io                           （Saga/CQRS/API Gatewayパターン）
https://learn.microsoft.com/en-us/azure/architecture/  （Azure Architecture Center）
https://github.com/mehdihadeli/awesome-software-architecture  （Awesomeアーキテクチャリスト）

# 日本語技術情報源
https://dev.classmethod.jp                         （DevelopersIO・AWS/AI技術・国内最大級）
https://zenn.dev/topics/[KEYWORD]/feed             （Zennトピック別RSSフィード）
https://qiita.com/tags/[KEYWORD]/feed.atom         （QiitaタグAtomフィード）
https://b.hatena.ne.jp/hotentry/it                （はてなブックマーク IT・エンジニアトレンド）
https://connpass.com/api/v1/event                  （技術勉強会イベント情報API）
https://techplay.jp                                （TECH PLAY・大型ITイベント）
https://www.itmedia.co.jp/aiplus/                 （ITmedia AI+・AI/ML日本語ニュース）

# RSS/Webhook 自動収集
https://rsshub.app                                 （あらゆるサイトをRSSフィード化）
https://rssapi.net                                 （RSS→Webhook変換サービス）
```

タスク:
1. [BUILD_TARGET] の2026年時点での最新アーキテクチャベストプラクティスを特定
2. HN/Reddit/Zenn/Qiita での議論から「本当の課題」と「未解決ニーズ」を抽出
3. 類似OSS/SaaSの比較（GitHub Stars推移・更新頻度・採用率）
4. SOLID + CQRS + Event-driven 設計の適用可否を判定
5. Mermaid C4 アーキテクチャ図を作成（コンポーネント・データフロー・外部API含む）

出力: `research/agent_c_arch.md` + `architecture.mermaid`（**500文字以内要約**）

---

### Pass 1.5: リサーチスキル追加投入（Pass 1 完了後・/compact 実行後）

Agent A/B/C の結果を受けて、以下のスキルを3バッチで追加実行。

--- バッチA: 大規模統合リサーチ ---
  A1. /mega-research — 6つの検索API統合調査
  A2. /mega-research-plus — 8ソース統合（最高精度）
  A3. /deep-research — 自律マルチステップ調査
→ /compact 実行

--- バッチB: 特化型リサーチ ---
  B1. /note-research — 日本のnote.com記事（日本語コミュニティ）
  B2. /exa-search — セマンティック検索（類似技術記事発見）
  B3. /deep-research-grok — Grok-4 Live Search（リアルタイム最新情報）
→ /compact 実行

--- バッチC: 55サイト333コマンド ---
  C1. /opencli-research — opencli-rs で以下を実行:
      - opencli-rs hackernews top/search "[KEYWORD]" --format json
      - opencli-rs arxiv search "[KEYWORD]" --format json
      - opencli-rs devto search "[KEYWORD]" --format json
      - opencli-rs youtube search "[KEYWORD]" --format json
      - opencli-rs youtube transcript [発見した関連動画URL] --format json
      - opencli-rs stackoverflow search "[KEYWORD]" --format json
      - opencli-rs bloomberg --format json（金融関連の場合）
      - opencli-rs twitter search "[KEYWORD]" --format json（認証済みの場合）
      - opencli-rs reddit hot --subreddit [関連subreddit] --format json（認証済みの場合）
→ /compact 実行

---

### Pass 2: ギャップ補完リサーチ（必須・省略禁止）

Pass 1 + 1.5 の結果を受け取ったら、不足・不明確な点を特定して実行:

```
/omega-research  （XAI_API_KEY ありの場合）
または
/mega-research-plus  （なければこちら）
```

omega-research の4レイヤー:
```
Layer 1: Grok-4 Agent Tools + Exa semantic search
Layer 2: Tavily + Brave + NewsAPI + SerpAPI + Perplexity
Layer 3: GIS 31ソース + X API v2 340アカウント監視
Layer 4: Arxiv + Papers with Code + HF Daily
```

Pass 2 で補完すること:
- Pass 1 + 1.5 で「不明」「要確認」とした全項目
- セキュリティリスクが高いツールの代替案
- コスト試算の精度向上
- 日本語コミュニティの反応（Zenn/Qiita/はてブ/note）

追加実行（ギャップがある場合）:
  D1. /world-research — 全世界総合リサーチ
  D2. /gem-research — Gemini活用9層調査
→ /compact 実行

--- URL・ドキュメント・動画分析 ---
  E1. /url-all — 発見した重要URLの完全分析
  E2. /url-deep-analysis — 競合サービスの構造分析
  E3. /context7-docs — 使用予定フレームワークの最新ドキュメント取得
  E4. /youtube-summarizer — 関連カンファレンス動画の要約
  E5. /firecrawl — 重要サイトの深層スクレイピング
  E6. /tavily-web — Web検索・コンテンツ抽出
  E7. /research-free — APIキー不要の軽量補完
→ /compact 実行

**STEP 2 完了後、全エージェント結果を統合してから STEP 3 へ。**

---

## STEP 3 — システム構築に必要なものを全て揃える

### 3-A. TrendScore 計算

発見した全ツール・ライブラリに以下のスコアを計算:

```
TrendScore =
  0.35 × stars_delta_7d
+ 0.25 × npm_growth_30d
+ 0.20 × x_engagement_score
+ 0.10 × hn_reddit_score
+ 0.10 × recency_score

判定:
  hot  : TrendScore > 0.7  ★★★ 即採用推奨
  warm : 0.4〜0.7          ★★  要検討
  cold : < 0.4             ★   採用非推奨
```

出力: TOP 10 ツールを hot/warm/cold で色分けした表 + `research/discovered_tools.json`

### 3-B. コンプライアンス・セキュリティチェック

- データ取得・保存・配布が規約/著作権/PII 観点で問題ないか
- CVE/脆弱性（osv.dev・socket.dev 調査結果）
- OSS ライセンス（MIT/Apache/GPL等）と商用利用可否

出力: `research/risk_register.md`

### 3-C. システムアーキテクチャ設計

設計原則: SOLID + CQRS + Event-driven + API-first

推奨スタック:
```
Runtime:    Node.js 22 LTS (TypeScript strict mode)
Database:   PostgreSQL 16 + pgvector + Redis 7
Queue:      BullMQ
Monitoring: Prometheus + Grafana
Deploy:     Docker Compose → Kubernetes (Phase 3)
CI/CD:      GitHub Actions
```

Mermaid C4 図を作成（コンポーネント・データフロー・外部API含む）。

出力: `research/architecture_final.md` + `architecture.mermaid`（更新版）

### 3-D. 実装計画（3フェーズ）

- **Phase 1**: MVP（1ヶ月 / $20〜50/月）- コアAPI統合・DB・基本機能
- **Phase 2**: 自動化（1〜3ヶ月 / $100〜200/月）- n8n・BullMQ・自動配信
- **Phase 3**: スケール（3〜6ヶ月 / $300〜500/月）- Kafka・Kubernetes

---

## STEP 4 — 12セクション完全レポート生成

### 出力先

```
research/runs/{YYYY-MM-DD}__system-proposal/
├── report.md                ← メインレポート（12セクション必須）
├── architecture.mermaid
├── discovered_tools.json    ← TrendScore付き
├── keyword_universe.csv
├── cost_breakdown.csv
└── x_trends.json
```

### レポート構成（省略禁止・全12セクション必須）

1. **Executive Summary** — 価値・差別化・コスト・ROI。「なぜ今作るべきか」を3行で
2. **市場地図** — MCP/API/拡張機能の全体マップ・競合差別化分析
3. **X/SNSリアルタイムトレンド分析** — SNSデータから読み取れるトレンド
4. **Keyword Universe** — キーワード展開結果（全カテゴリ）
5. **データ取得戦略** — どこから・どうやって取得するか（全ソース一覧）
6. **正規化データモデル** — TypeScript interface / PostgreSQL設計
7. **TrendScore算出結果** — 全ツールのスコア表（hot/warm/cold）
8. **システムアーキテクチャ図** — Mermaid C4 図
9. **実装計画（3フェーズ・Ganttチャート）** — Mermaid gantt
10. **セキュリティ/法務/運用設計** — CVE・ライセンス・PII・RunBook
11. **リスクと代替案** — リスク×確率×影響×代替案の表
12. **Go/No-Go意思決定ポイント** — 今すぐ作るべき理由TOP3・最初の1アクション

---

## STEP 4.5 — QA Gate（ChatGPT 5.4 thinking / OpenRouter）

**STEP 4 レポート生成後、提出前に必ず実行する。**

3名の独立したレビュアーを OpenRouter 経由で並列呼び出し:

```typescript
import OpenAI from "openai"
const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://taisun-agent.local",
    "X-Title": "TAISUN v2 QA Gate",
  },
})
const [r1, r2, r3] = await Promise.all([
  client.chat.completions.create({ model: "openai/chatgpt-5.4", reasoning_effort: "high", messages: [{ role: "user", content: REVIEWER1_PROMPT }] }),
  client.chat.completions.create({ model: "openai/chatgpt-5.4", reasoning_effort: "high", messages: [{ role: "user", content: REVIEWER2_PROMPT }] }),
  client.chat.completions.create({ model: "openai/chatgpt-5.4", reasoning_effort: "high", messages: [{ role: "user", content: REVIEWER3_PROMPT }] }),
])
```

OPENROUTER_API_KEY が未設定の場合: Claude Opus 4.6 にフォールバック。

### Reviewer 1 — 網羅性チェック（合格ライン: 70点以上）

- キーワード分類が全て埋まっているか
- Agent A: TOP 20 リストに install コマンドが全件付いているか
- Agent B: 全候補に CVE チェック結果があるか
- Agent C: Mermaid C4 図に外部APIが全て記載されているか
- Pass 2 で「不明」「要確認」が全て解消されているか

### Reviewer 2 — 信頼性チェック（合格ライン: 70点以上）

- 引用URLが全て実在するか
- 数値・コストに出典URLが付いているか
- 複数ソースで矛盾する情報がないか
- 抽象論だけで終わっている箇所がないか（「〜が重要」禁止）

### Reviewer 3 — 実用性チェック（合格ライン: 70点以上）

- アーキテクチャが [BUILD_TARGET] の要件を満たしているか
- Phase 1 MVP が明日から作業開始できるか
- 月間 $40 上限に収まっているか
- 開発未経験者が「次に何をすべきか」を理解できるか

### 判定ロジック

```
✅ PASS（全員 70点以上）       → ユーザーへ提出
⚠️ CONDITIONAL（1名不合格）   → 不合格項目のみ自動補完 → 再判定
❌ FAIL（2名以上不合格）       → STEP 2 Pass 2 を再実行 → 全体再レビュー
```

QA結果サマリーをレポート末尾に追記:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 QA レビュー結果（ChatGPT 5.4 thinking / OpenRouter）

  網羅性（Reviewer 1）: [スコア]/100  [PASS/FAIL]
  信頼性（Reviewer 2）: [スコア]/100  [PASS/FAIL]
  実用性（Reviewer 3）: [スコア]/100  [PASS/FAIL]
  ────────────────────────────────────
  総合QAスコア: [平均]/100  → [✅ PASS / ⚠️ CONDITIONAL / ❌ FAIL]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## ユーザーへの提出（QA PASS後のみ）

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 TAISUN v2 リサーチレポート完成

対象システム: [BUILD_TARGET]
生成ファイル: research/runs/{YYYY-MM-DD}__system-proposal/
🔍 QA総合スコア: [スコア]/100

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⬇️ 次のアクション

✅「問題なし / 進めて」
    → /gather-requirements + /sdd-full でシステム設計を開始

✏️「追加・修正してほしい箇所: [内容]」
    → 指定箇所を修正して再提出

❓「[質問内容]を確認したい」
    → 詳細調査して回答
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**⚠️ ユーザーの確認・承認なしに要件定義や実装に進まないこと。**

---

## 品質基準（全STEPで守ること）

| 項目 | 基準 |
|------|------|
| 最低情報源数 | 各発見につき3ソース以上の裏付け |
| 引用 | 数値・コストには出典URLを付記（必須） |
| 抽象論禁止 | 「〜が重要です」だけで終わらず、必ず具体的な実装方法まで落とす |
| 言語 | 日本語優先（技術用語は英語OK） |
| 月間予算上限 | $40/月（超える場合は必ず代替手段を提示） |
| サブエージェント結果 | **各エージェントの返答は500文字以内に要約** |
| ディープリサーチ回数 | **Pass 1 + Pass 2 の2回実施（省略禁止）** |
| コンパクト | フェーズ境界で `/compact` を実行 |
| QA Gate | **3レビュアー全員 70点以上でなければ提出禁止** |
