---
name: research-tier-guide
description: リサーチスキル選び方ガイド（Tier 0〜4）
---

# リサーチスキル選び方ガイド

## 迷ったら

- APIキーがない → `/research-free`
- とりあえず調べたい → `/research`
- 本気で調べたい → `/omega-research`
- システムを作る前に → `/research-system`

## Tier 一覧

| やりたいこと | スキル | 時間 | API キー | コスト目安 |
|-----------|------|------|---------|---------|
| 毎日の情報収集（経済指標・SNS） | `/intelligence-research` | 5分 | FRED 推奨 | 無料〜 |
| 素早く概要把握（無料） | `/research-free` | 10分 | 不要 | 無料 |
| 素早く概要把握 | `/research` | 10分 | 任意 | 無料〜 |
| しっかり深掘り（Grok） | `/deep-research-grok` | 30分 | XAI_API_KEY | ~$1 |
| しっかり深掘り（多 API） | `/mega-research` | 30分 | TAVILY 等 | ~$1 |
| 全力リサーチ | `/omega-research` | 1h | XAI+TAVILY 等 | ~$3 |
| 全力リサーチ（+8 ソース） | `/mega-research-plus` | 1h | 複数 API | ~$3 |
| システム構築前の全力調査 | `/research-system` | 15-30分 | OPENROUTER 必須 | ~$5 |

## 特化型（特定用途向け）

| 用途 | スキル | 備考 |
|------|-------|------|
| マーケティング調査 | `/gem-research` | 9層マーケティング特化 |
| note.com 分析 | `/note-research` | note 特化 |
| SNS・学術横断 | `/world-research` | 全世界 SNS + 論文 |
