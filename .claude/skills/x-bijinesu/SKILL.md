---
name: x-bijinesu
description: X記事自動投稿パイプライン (クラウドLLM版) - 海外ビジネス事例ベースの高品質X記事を自動生成・投稿。Pexels画像5枚+カバー画像付き。複数ジャンル対応。
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# x-bijinesu - X記事自動投稿パイプライン (クラウドLLM版)

xAI Grok-3（クラウドLLM）を使ったX記事自動投稿パイプライン。
海外ビジネス成功事例を日本語記事化し、Pexels画像付きでX Articlesに投稿。

> **他ジャンルへの転用も可能** — ビジネス以外のジャンル（テック・ライフスタイル・健康・教育等）への対応方法は「ジャンル別カスタマイズ」セクションを参照。

## パイプラインフロー

```
Stage 1: リサーチ
  │  リサーチネタ元.md（海外サイト50+）からランダム選定
  │  → 10サイトをピックアップ → Claude/Grokでトレンド記事判定
  ↓
Stage 2: 記事生成 + ツイート文生成
  │  記事: xAI Grok-3 (5,000-8,000文字)
  │  ツイート: xAI Grok-3 (280文字以内)
  │  → テンプレート自動選択 (10パターン)
  │  → data/articles/YYYYMMDD_タイトル.md に保存
  ↓
Stage 3: カバー画像取得
  │  Pexels API → 英語検索クエリで高品質写真DL
  │  → tmp/cover-*.jpg に保存
  ↓
Stage 4: インライン画像挿入
  │  Pexels API → 各セクションに対応する画像を5枚取得
  │  → 記事Markdownのセクション境界に挿入
  ↓
Stage 5: X投稿
  │  Playwright (Cookie認証) → X Articlesページを自動操作
  │  → カバー画像アップロード → 記事本文入力 → 公開
  │  → ツイート文 + 記事カードURLで投稿
  ↓
完了: data/runs/YYYYMMDD-HHMMSS/ にログ保存
     stage0_result.json (サマリー) + stageN_result.json
```

## 使用モデル

| 用途 | プライマリ | フォールバック1 | フォールバック2 |
|------|-----------|----------------|----------------|
| 記事生成 | xAI Grok-3 (`grok-3`) | Ollama `qwen2.5:72b` | OpenRouter Claude Sonnet |
| ツイート生成 | xAI Grok-3 (`grok-3`) | Ollama `qwen3:8b` | OpenRouter Claude Sonnet |

LLMプロバイダー優先順位は自動フォールバック（環境変数設定状況により決定）。

## 使用API

| API | 用途 | 認証 |
|-----|------|------|
| xAI API (api.x.ai) | 記事・ツイート生成 | `XAI_API_KEY` |
| Pexels API | カバー + インライン画像 (計6枚) | `PEXELS_API_KEY` |
| X (Twitter) | 記事投稿 + ツイート | `TWITTER_COOKIES` |

## 前提条件

1. **プロジェクトディレクトリ**: `~/Desktop/開発2026/X記事投稿システム/`
2. **Node.js**: v18+
3. **Chromium**: Playwright用（初回は `npx playwright install chromium` が必要）
4. **環境変数** (`.env`):
   - `XAI_API_KEY` — xAI API キー（記事・ツイート生成）
   - `PEXELS_API_KEY` — Pexels 画像 API キー
   - `TWITTER_COOKIES` — X のセッションCookie（JSON配列）
   - `ANTHROPIC_BASE_URL` — Ollamaフォールバック時: `http://localhost:11434/v1`
   - `ANTHROPIC_API_KEY` — Ollamaフォールバック時: `ollama`
   - `OPENROUTER_API_KEY` — OpenRouterフォールバック時

## Instructions

### 依存チェック

```bash
cd ~/Desktop/開発2026/X記事投稿システム
cat .env | grep -E "(XAI|PEXELS|TWITTER)_"
node --version
```

### 実行モード

#### 1. ドライラン（記事生成のみ、投稿なし）

```bash
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline:dry
```

#### 2. 本番実行（全ステージ: リサーチ→記事→画像→投稿）

```bash
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline
```

#### 3. ステージ個別実行

```bash
# Stage 1: リサーチのみ
npx ts-node src/pipeline/run-pipeline.ts --stage 1

# Stage 2: 記事生成のみ（前回Stage1結果を再利用）
npx ts-node src/pipeline/run-pipeline.ts --stage 2

# Stage 3: カバー画像のみ
npx ts-node src/pipeline/run-pipeline.ts --stage 3

# Stage 4: インライン画像挿入のみ
npx ts-node src/pipeline/run-pipeline.ts --stage 4

# Stage 5: 投稿のみ（生成済み記事を使用）
npx ts-node src/pipeline/run-pipeline.ts --stage 5
```

#### 4. 推奨: 半自動モード

```bash
# STEP 1: 記事生成まで（Stage 1-4）
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline:dry

# STEP 2: 生成記事を確認
ls data/articles/

# STEP 3: 問題なければ投稿
npx ts-node src/pipeline/run-pipeline.ts --stage 5
```

### 実行ログの確認

```bash
# 最新ランのログ
ls -lt data/runs/ | head -5
cat data/runs/$(ls -t data/runs/ | head -1)/stage0_result.json

# 投稿済み記事URL確認
cat data/runs/$(ls -t data/runs/ | head -1)/stage5_result.json
```

## ソースファイル（ネタ元）

### デフォルト: リサーチネタ元.md

```
~/Desktop/開発2026/X記事投稿システム/research/リサーチネタ元.md
```

5カテゴリ（ビジネス・マーケティング・副業・AI・投資）、約50サイト。

### 拡張: 元ネタX海外ネタ記事.md

```
~/X記事投稿システム/xxxx2026/元ネタX海外ネタ記事.md
```

13カテゴリ（ECビジネス・SaaS・コンテンツビジネス・フリーランス等）、約50サイト。

ソース変更方法 → `src/pipeline/research.ts` の `SOURCES_PATH` を変更。

## テンプレート自動選択（10パターン）

テンプレートソース: `~/X記事投稿システム/xxxx2026/トミーX記事切り口テンプレ/*.md`

| # | テンプレート名 | 切り口 |
|---|---------------|--------|
| 01 | パラドックス型 | 「〜しているのに〜できない」矛盾を突く |
| 02 | データドリブン型 | 数字・統計から切り込む |
| 03 | ゼロヒーロー変身型 | 無名の人物が成果を出した話 |
| 04 | 秘密暴露型 | 業界の知られていない事実を暴露 |
| 05 | 常識破壊型 | 常識とされていることを覆す |
| 06 | ステップ解説型 | 「〜を実現した5つのステップ」 |
| 07 | 問題提起型 | 読者が抱える問題を先に提示 |
| 08 | 業界暴露型 | 特定業界の内幕を明かす |
| 09 | AI活用型 | AIを使って効率化した事例 |
| 10 | 凡人救済型 | 特別な才能なしで成功した話 |

## 記事品質基準

| 項目 | 基準 | 不合格条件 |
|------|------|-----------|
| 文字数 | 5,000-8,000文字 | 500文字未満でエラー |
| セクション数 | 7-8（導入→5章→結論） | 3セクション以下 |
| フック（冒頭） | 疑問形 or 衝撃的事実 | 平凡な導入 |
| 具体的数字 | 各セクション1つ以上 | 数字ゼロ |
| インライン画像 | 5枚（Pexels） | 画像なし |
| カバー画像 | 1枚（Pexels） | カバーなし |
| CTA | 記事末に行動喚起 | CTA欠落 |

## ツイート品質基準

| 項目 | 基準 | 禁止事項 |
|------|------|---------|
| 文字数 | 280文字以内 | 超過 |
| フレーミング | ビジネスケーススタディ・分析記事として紹介 | — |
| 数字 | 控えめに使用（「ARR○億規模のSaaS」等） | 「○倍」「○%増」の誇大強調 |
| ハッシュタグ | なし | ハッシュタグ付き |
| ScamSniffer回避 | ビジネス分析語で表現 | 「激増」「爆増」「驚異の」「常識破壊」 |

## ScamSniffer（詐欺検知）回避ルール

X のサードパーティ詐欺検知拡張が反応する表現は使用禁止:

**禁止ワード**: 激増・爆増・急増・爆発的・驚異の・驚愕の・衝撃の・常識破壊・革命的・○倍に・○%増・稼ぐ方法・稼げる・誰でも・簡単に・今すぐ・無料で

**推奨スタイル**: 「〜の事業モデルを分析」「〜の戦略を解説」「〜のアプローチとは」「ARR○億規模のSaaS企業が〜」

## 文体ルール（トミースタイル）

- **常体**（だ・である調）をベースに、読者への語りかけ混在
- 「〜していませんか？」「〜はずです」で読者を引き込む
- 海外事例の「翻訳・解説者」ポジション
- 「> トミー：」形式のコメント挿入で権威性演出
- 具体的な金額・人数を必ず含める

## 出力ファイル

| ファイル | パス |
|---------|------|
| 生成記事 | `data/articles/YYYYMMDD_タイトル.md` |
| Stage結果JSON | `data/runs/YYYYMMDD-HHMMSS/stageN_result.json` |
| サマリー | `data/runs/YYYYMMDD-HHMMSS/stage0_result.json` |
| 投稿済みURL | `stage5_result.json` の `articleUrl` フィールド |

## 環境変数一覧

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `XAI_API_KEY` | (必須) | xAI Grok-3 APIキー |
| `PEXELS_API_KEY` | (必須) | Pexels画像APIキー |
| `TWITTER_COOKIES` | (投稿時必須) | XセッションCookie (JSON配列) |
| `ANTHROPIC_BASE_URL` | `http://localhost:11434/v1` | Ollamaフォールバック用 |
| `ANTHROPIC_API_KEY` | `ollama` | Ollamaフォールバック用 |
| `OPENROUTER_API_KEY` | (オプション) | OpenRouterフォールバック用 |
| `ARTICLE_MODEL` | `grok-3` | 記事生成モデル名 |
| `TWEET_MODEL` | `grok-3` | ツイート生成モデル名 |

## 主要ソースファイル

| ファイル | 役割 |
|---------|------|
| `src/pipeline/run-pipeline.ts` | パイプライン制御・オーケストレーター |
| `src/pipeline/research.ts` | Stage 1: リサーチ + ネタ元ファイル解析 |
| `src/pipeline/article-generator.ts` | Stage 2: 記事・ツイート生成 + LLMプロバイダー制御 |
| `src/pipeline/image-sourcer.ts` | Stage 3: Pexels カバー画像取得 |
| `src/pipeline/image-inserter.ts` | Stage 4: インライン画像挿入 |
| `src/pipeline/x-article-poster.ts` | Stage 5: Playwright X Articles 自動投稿 |

---

## ジャンル別カスタマイズ（汎用化ガイド）

このスキルはデフォルトで「ビジネス（海外成功事例）」ジャンルで動作するが、
以下の手順で任意のジャンルに転用できる。

### 変更が必要な3点

#### 1. ネタ元ファイルを差し替える

```bash
# 現在のネタ元ファイル
research/リサーチネタ元.md

# ジャンル別に別ファイルを作成してコピー
cp research/リサーチネタ元.md research/リサーチネタ元_テック.md
```

フォーマット（変更不要）:
```
### N-M. サイト名
**URL**: https://example.com
「ネタ例: こういう記事が多い」
```

ジャンル別サイト例:
- **テック**: TechCrunch, Product Hunt, Hacker News, dev.to
- **ライフスタイル**: Lifehacker, Zen Habits, Buffer Blog
- **健康・ウェルネス**: Healthline, Medical News Today, Examine.com
- **教育・学習**: EdSurge, Class Central, eLearning Industry
- **投資・金融**: Motley Fool, Seeking Alpha, Morning Brew

#### 2. 記事生成プロンプトを調整する

`src/pipeline/article-generator.ts` の `buildArticlePrompt()` 内の以下を変更:

```typescript
// 現在: ビジネス特化
const PERSONA = "あなたはトミーです。海外ビジネス事例を日本語で分かりやすく解説するライター。"

// テック向けに変更例:
const PERSONA = "あなたはトミーです。海外テック最新情報を日本語で分かりやすく解説するライター。"

// ライフスタイル向けに変更例:
const PERSONA = "あなたはトミーです。海外の生産性・ライフハック情報を日本語で実践的に解説するライター。"
```

#### 3. ツイートフレーミングを調整する

`src/pipeline/article-generator.ts` の `buildTweetPrompt()` の推奨フレーミングを変更:

```typescript
// 現在: ビジネスケーススタディ
"**ビジネスケーススタディ・分析記事として紹介する**"

// テック向けに変更例:
"**技術解説・トレンド分析記事として紹介する**"

// ライフスタイル向けに変更例:
"**ライフハック・生産性改善記事として紹介する**"
```

### ジャンル別設定早見表

| ジャンル | ネタ元ファイル | ペルソナ | ツイートフレーミング |
|---------|--------------|---------|-------------------|
| ビジネス（デフォルト） | リサーチネタ元.md | 海外ビジネス解説者 | ビジネスケーススタディ |
| テック | リサーチネタ元_テック.md | 海外テック解説者 | 技術解説・トレンド分析 |
| ライフスタイル | リサーチネタ元_ライフ.md | 海外ライフハック解説者 | ライフハック・実践レポート |
| 教育 | リサーチネタ元_教育.md | 海外教育メソッド解説者 | 教育手法・学習法分析 |
| 投資 | リサーチネタ元_投資.md | 海外投資戦略解説者 | 投資戦略・市場分析 |

### 複数アカウント運用

アカウントごとにジャンルを分けて運用する場合:

```bash
# ビジネス特化アカウント
TWITTER_COOKIES=$BUSI_COOKIES npm run pipeline

# テック特化アカウント（別ネタ元）
SOURCES=テック TWITTER_COOKIES=$TECH_COOKIES npm run pipeline
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| xAI APIが応答しない | APIキー切れ or レート制限 | `.env` の `XAI_API_KEY` を確認。Ollamaフォールバックに切替 |
| 記事が500文字未満 | LLM応答が短い | `ARTICLE_MODEL=qwen2.5:72b` でOllamaに切替 |
| カバー画像アップロード失敗 | X UI変更 | `src/pipeline/x-article-poster.ts` の `uploadCoverImageToEditor()` を確認 |
| Publish ボタンが有効にならない | 画像クロップダイアログが未処理 | `dismissCropDialog()` が正常動作しているかログ確認 |
| X投稿失敗 (Cookie期限切れ) | セッション失効 | X にログイン→Cookie再取得→`TWITTER_COOKIES` を更新 |
| ScamSniffer警告が出る | ツイート文に禁止ワードが含まれる | `buildTweetPrompt()` の禁止ワードリストを確認 |
| Pexels画像取得0件 | 検索クエリが英語でない or API上限 | `PEXELS_API_KEY` を確認。英語検索クエリを使用 |

## Cookie取得方法（`TWITTER_COOKIES` 更新手順）

1. Chrome で X にログイン
2. DevTools → Application → Cookies → `https://x.com`
3. 必要なCookie名: `auth_token`, `ct0`, `twid`, `kdt`, `guest_id` 等
4. JSON配列形式でコピー:
   ```json
   [{"name":"auth_token","value":"xxx","domain":".x.com",...}, ...]
   ```
5. `.env` の `TWITTER_COOKIES` に設定

## サンプルプロンプト

### 例1: フルパイプライン実行
```
x-bijinesuスキルで記事生成・投稿を実行して。
```

### 例2: ドライランで確認後に投稿
```
まずドライランで記事を生成して内容を見せて。
OKなら投稿まで進めて。
```

### 例3: テックジャンル向け実行
```
x-bijinesuスキルをテック系ジャンル向けに設定して記事を生成して。
ネタ元はHacker NewsとProduct Huntを使って。
```

### 例4: ステージ指定
```
Stage 2（記事生成）のみ実行して。前回のリサーチ結果を使用。
```

### 例5: 結果確認
```
最新の投稿結果とXのURLを確認して。
```
