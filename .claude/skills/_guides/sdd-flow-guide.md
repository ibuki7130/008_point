---
name: sdd-flow-guide
description: SDD スキルの使い方ガイド（Ollama 有無別）
---

# SDD スキルの使い方ガイド

## ⚠️ Ollama 必須スキル（deepseek-r1:70b 推奨）

- `/sdd-full` — フルパイプライン統括
- `/sdd-design` — C4/Arc42 設計書
- `/sdd-req100` — 要件定義と採点

## 軽量ルート（Ollama 不要）

1. `/sdd-stakeholder` — 関係者整理
2. `/sdd-context` — コンテキスト設計
3. `/sdd-glossary` — 用語統一
4. `/sdd-threat` — 脅威モデリング
5. `/sdd-guardrails` — 制約・ガードレール
6. `/sdd-tasks` — タスク分解
7. `/sdd-adr` — 意思決定記録
8. `/sdd-runbook` — 運用手順書

## フルルート（Ollama 必要）

`/sdd-full` → `/sdd-req100` → `/sdd-design`
+ 上記の軽量ルートを組み合わせ

## Ollama のインストール

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# 必要モデルのダウンロード
ollama pull deepseek-r1:70b
```
