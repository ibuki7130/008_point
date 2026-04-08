---
name: xtaiou
description: X記事自動投稿パイプライン (Ollama版) - X投稿・ツイート文・ポスト案・バズる文案の生成からX投稿まで全自動実行
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# xtaiou - X記事投稿パイプライン (Ollama Local LLM)

Ollamaローカル LLM を使ったX記事自動投稿パイプライン。
コスト0円で記事生成・ツイート投稿を完全自動化。

## パイプラインフロー

```
Stage 1: トレンドリサーチ
  │  Twitter検索 (MCP) + リサーチネタ元.md
  │  → トピック選定・関連度スコアリング
  ↓
Stage 2: 記事生成 + ツイート文生成
  │  記事: Ollama qwen2.5:72b (5,000-8,000文字)
  │  ツイート: Ollama qwen3:8b (280文字以内)
  │  → テンプレート自動選択 (10パターン)
  ↓
Stage 3+4: カバー画像取得 & Markdown挿入
  │  Pexels API → 画像DL → 記事に挿入
  ↓
Stage 5: X投稿
  │  Cookie認証 (シングル) or OAuth 2.0 (マルチ)
  │  → ツイート文 + 画像付きで投稿
  ↓
完了: data/runs/YYYYMMDD-HHMMSS/ にログ保存
```

## 使用モデル (固定 - Ollamaローカル)

| 用途 | モデル | サイズ | API |
|------|--------|--------|-----|
| 記事生成 | `qwen2.5:72b` | 47GB | `http://localhost:11434/v1` |
| ツイート生成 | `qwen3:8b` | 5.2GB | `http://localhost:11434/v1` |

VRAM不足時のフォールバック:
- 記事生成: `qwen2.5:32b` (19GB) または `qwen3-coder:30b` (18GB)
- ツイート生成: `glm4:latest` (5.5GB)

## 前提条件

1. **Ollama起動中**: `ollama serve` が実行されていること
2. **モデルダウンロード済み**: `ollama pull qwen2.5:72b` + `ollama pull qwen3:8b`
3. **プロジェクトディレクトリ**: `~/Desktop/開発2026/X記事投稿システム/`
4. **環境変数** (`.env`):
   - `PEXELS_API_KEY` - 画像取得用 (Stage 3)
   - `TWITTER_COOKIES` - シングルアカウント投稿用 (Stage 5)
5. **依存コマンド**: node (v18+), npm, ollama, curl

## Instructions

### 依存チェック

パイプライン実行前に必ず確認:

```bash
bash ./scripts/check-deps.sh
```

### 実行モード

#### 1. ドライラン (テスト用 - APIもX投稿もなし)

```bash
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline:dry
```

#### 2. 本番実行 (全ステージ)

```bash
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline
```

#### 3. ステージ指定実行

```bash
# Stage 1のみ: リサーチ
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline:stage -- --stage 1

# Stage 2のみ: 記事生成 (ドライラン)
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline:stage -- --stage 2 --dry-run

# Stage 2のみ: 記事生成 (本番)
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline:stage -- --stage 2
```

#### 4. マルチアカウント投稿

```bash
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline -- --account 3
```

### 半自動モード (推奨)

1. Stage 1-4 を実行（記事生成まで）
2. `data/articles/YYYYMMDD_タイトル.md` を人間が確認
3. 品質OKなら Stage 5 で投稿

```bash
# 記事生成まで
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline:stage -- --stage 1
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline:stage -- --stage 2

# 確認後に投稿
cd ~/Desktop/開発2026/X記事投稿システム && npm run pipeline:stage -- --stage 5
```

## テンプレート自動選択 (10パターン)

| # | テンプレート | マッチキーワード |
|---|-------------|-----------------|
| 01 | パラドックス型 | パラドックス, 矛盾 |
| 02 | データドリブン型 | データ, 数字 |
| 03 | ゼロヒーロー変身型 | ゼロ, 凡人 |
| 04 | 秘密暴露型 | 秘密, 暴露 |
| 05 | 常識破壊型 | 常識, 破壊 |
| 06 | ステップ解説型 | ステップ, 方法 |
| 07 | 問題提起型 | 問題, 課題 |
| 08 | 業界暴露型 | 業界, 暴露 |
| 09 | AI活用型 | AI, 自動 |
| 10 | 凡人救済型 | 凡人, 普通 |

テンプレートソース: `トミーX記事切り口テンプレ/*.md`

## 記事品質基準

| 項目 | 基準 | 不合格条件 |
|------|------|-----------|
| 文字数 | 5,000-8,000文字 | 500文字未満でエラー |
| セクション数 | 7-8 (導入→5章→結論) | 3セクション以下 |
| フック (冒頭) | 疑問形 or 衝撃的事実 | 平凡な導入 |
| 具体的数字 | 各セクション1つ以上 | 数字ゼロ |
| CTA | 記事末に行動喚起 | CTA欠落 |
| ペルソナ一貫性 | トミースタイル維持 | 文体ブレ |

## ツイート品質基準

| 項目 | 基準 | 不合格条件 |
|------|------|-----------|
| 文字数 | 280文字以内 | 超過 |
| 数字 | 1つ以上の具体的数字 | 数字なし |
| 好奇心刺激 | 「なぜ」「実は」等の表現 | 平凡な告知文 |
| ハッシュタグ | なし | ハッシュタグ付き |

## サンプルプロンプト

### 例1: トピック指定で記事生成
```
OpenClawの魅力を30代エンジニア向けにX投稿記事を生成して。
テンプレートはAI活用型で、5000文字以上。
```

### 例2: ツイート文のみ生成
```
「寝ながら月1000万稼ぐ方法」をテーマにバズるツイート文を3案作成して。
各140字以内、CTA付き、口調は親しみ系で。
```

### 例3: フルパイプライン実行
```
X記事投稿パイプラインを全ステージ実行して。
トピックはAIエージェントの最新動向で。
```

### 例4: ドライラン + 確認
```
ドライランモードで記事生成して、内容を確認させて。
問題なければ投稿まで進めて。
```

### 例5: マルチアカウント
```
アカウント3で「コピペだけで稼ぐ方法」のポスト案を生成・投稿して。
```

## 文体ルール (トミースタイル)

詳細は `./references/style-guide.md` を参照。

主要ルール:
- **常体** (だ・である調) をベースに、読者への語りかけ混在
- 「〜していませんか？」「〜はずです」で読者を引き込む
- 海外事例の「翻訳・解説者」ポジション
- 「こっそり公開」「消す前に保存推奨」等の希少性演出
- 「> トミー：」形式のコメント挿入で権威性
- 具体的な金額・人数を必ず含める

## 禁止ルール

詳細は `./references/forbidden-rules.md` を参照。

主要禁止事項:
- 誇大表現（「絶対」「100%」「必ず」等の断定）
- 根拠のない収益保証
- ハッシュタグの使用
- 絵文字の過度な使用
- 他者の誹謗中傷
- 薬機法・景表法に抵触する表現

## 出力ファイル

| ファイル | パス |
|---------|------|
| 生成記事 | `data/articles/YYYYMMDD_タイトル.md` |
| Stage結果 | `data/runs/YYYYMMDD-HHMMSS/stageN_result.json` |
| サマリー | `data/runs/YYYYMMDD-HHMMSS/stage0_result.json` |

## 環境変数一覧

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `ANTHROPIC_BASE_URL` | `http://localhost:11434/v1` | Ollama API URL |
| `ANTHROPIC_API_KEY` | `ollama` | APIキー (Ollamaは不要) |
| `ARTICLE_MODEL` | `qwen2.5:72b` | 記事生成モデル |
| `TWEET_MODEL` | `qwen3:8b` | ツイート生成モデル |
| `PEXELS_API_KEY` | (必須) | Pexels画像API |
| `TWITTER_COOKIES` | (投稿時必須) | Cookie認証 |
| `ENCRYPTION_KEY` | (OAuth時必須) | トークン暗号化キー |

## コスト

**完全無料** (ローカルLLM + 無料API)
- Ollama: ローカル実行のため0円
- Pexels API: 無料枠
- X投稿: 無料

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| Ollamaが応答しない | プロセス停止 | `ollama serve &` で再起動 |
| モデルが見つからない | 未DL | `ollama pull qwen2.5:72b` |
| 記事が短い (500文字未満) | VRAM不足 | `ARTICLE_MODEL=qwen2.5:32b` にフォールバック |
| メモリ不足 | 72bモデル重い | `ARTICLE_MODEL=qwen2.5:32b` (19GB) を使用 |
| X投稿失敗 | Cookie期限切れ | `TWITTER_COOKIES` を再取得 |
