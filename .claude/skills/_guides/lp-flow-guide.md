---
name: lp-flow-guide
description: LP スキルの使い方ガイド（Ollama 有無別）
---

# LP スキルの使い方ガイド

## ルート A: Ollama 不要（全員が使える）

1. `/lp-analysis` — 既存 LP を分析
2. `/taiyo-analyzer` — スタイル・パターンを抽出
3. `/lp-design` — LP 構成を設計
4. `/lp-json-generator` — 画像用テキストを生成

## ルート B: Ollama 必要（本文自動生成まで）

1〜3 は上と同じ
4. `/lp-local-generator` — LP セクション本文を自動生成
5. `/lp-full-generation` — LP 全体を自動生成
6. `/lp-json-generator` — 画像用テキストを生成

⚠️ ルート B には Ollama が必要です
インストール: https://ollama.com/download

## 6 スキルの役割

| スキル | 何をするか | Ollama |
|-------|---------|--------|
| lp-analysis | 既存 LP の分析 | 不要 |
| lp-analytics | LP 知識ベース分析 | 不要（ChromaDB 必要） |
| lp-design | 構成設計 | 不要 |
| lp-json-generator | 画像テキスト生成 | 不要 |
| lp-local-generator | セクション生成 | ⚠️ 必要 |
| lp-full-generation | 全文生成 | ⚠️ 必要 |
