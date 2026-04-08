# スキル品質レポート

**生成日**: 2026-01-31
**総スキル数**: 78

---

## 1. 重複・類似スキル

### 統合推奨グループ

#### A. マーケティングコピー系 (統合推奨)
| 基本スキル | 太陽スタイル版 | 推奨アクション |
|-----------|---------------|---------------|
| `sales-letter` | `taiyo-style-sales-letter` | 太陽版に統合 |
| `vsl` | `taiyo-style-vsl` | 太陽版に統合 |
| `step-mail` | `taiyo-style-step-mail` | 太陽版に統合 |
| `lp-generator` | `taiyo-style-lp` | 太陽版に統合 |

**理由**: 太陽スタイル版は176パターン・80項目チェックリスト等の具体的手法を含み、基本版の上位互換

#### B. 画像生成系 (統合推奨)
| スキル | 機能 | 推奨アクション |
|--------|------|---------------|
| `nanobanana-pro` | NanoBanana Pro画像生成 | マスタースキルに |
| `gemini-image-generator` | Gemini画像生成 | nanobanana-proに統合 |
| `ai-manga-generator` | AI漫画生成 | nanobanana-proの拡張として維持 |
| `manga-production` | 漫画制作一般 | ai-manga-generatorに統合 |

**理由**: nanobanana-proとgemini-image-generatorは実質同じ機能

#### C. カスタマーサポート系
| スキル | 内容 |
|--------|------|
| `customer-support` | 6つの教育要素を含むCS返信 |
| `customer-support-120` | 120%超える神対応版 |

**推奨**: customer-support-120に統合（上位互換）

---

## 2. 品質スコア

### ファイル構成による品質評価

| グレード | 条件 | スキル数 |
|----------|------|---------|
| ⭐⭐⭐ A | SKILL.md + README.md + 追加ファイル | 5 |
| ⭐⭐ B | SKILL.md + CLAUDE.md | 35 |
| ⭐ C | SKILL.mdのみ | 38 |

### Aグレードスキル（模範例）
- `nanobanana-pro` - README, scripts, docs
- `lp-json-generator` - README, templates, scripts
- `テロップ` - 詳細instructions.md
- `ai-manga-generator` - README + instructions
- `dual-ai-review` - CLAUDE.md + prompt.md

### 要改善スキル（内容が薄い）
| スキル | サイズ | 問題 |
|--------|--------|------|
| `docker-mcp-ops` | 343 bytes | 説明不足 |
| `doc-convert-pandoc` | 378 bytes | 説明不足 |
| `pdf-automation-gotenberg` | 378 bytes | 説明不足 |
| `notion-knowledge-mcp` | 406 bytes | 説明不足 |
| `security-scan-trivy` | 406 bytes | 説明不足 |

---

## 3. スキルグループ分析

### 太陽スタイル系 (10個)
充実度: ⭐⭐⭐
- 詳細な手法記述（9,000-21,000 bytes）
- 176パターン、80項目チェックリスト
- 心理トリガー、感情曲線の具体的指示

### Video Agent系 (13個)
充実度: ⭐
- 各400-900 bytesと簡素
- CI/CD連携の骨格のみ
- 詳細実装が不足

### LP系 (5個)
充実度: ⭐⭐
- lp-json-generatorは充実
- 他は基本的な記述のみ

---

## 4. 推奨アクション

### 即時対応
1. **重複削除**: 基本版を太陽スタイル版にリダイレクト
2. **統合**: gemini-image-generator → nanobanana-pro
3. **統合**: manga-production → ai-manga-generator

### 中期対応
4. **拡充**: video-*系スキルの詳細化
5. **拡充**: MCP系スキル(docker, pdf, etc.)の詳細化
6. **テンプレート追加**: 薄いスキルにexample追加

### 長期対応
7. **統一フォーマット**: 全スキルにREADME.md追加
8. **テスト追加**: スキル動作確認テスト
9. **バージョニング**: 全スキルにversion記載

---

## 5. 削除可能なスキル

以下は上位互換が存在するため削除検討：

| 削除候補 | 上位互換 | 理由 |
|----------|----------|------|
| `sales-letter` | `taiyo-style-sales-letter` | 機能重複 |
| `vsl` | `taiyo-style-vsl` | 機能重複 |
| `step-mail` | `taiyo-style-step-mail` | 機能重複 |
| `gemini-image-generator` | `nanobanana-pro` | 同一機能 |
| `manga-production` | `ai-manga-generator` | 機能重複 |
| `customer-support` | `customer-support-120` | 上位互換 |
| `lp-generator` | `taiyo-style-lp` | 機能重複 |

**削減可能**: 7スキル → 71スキルに削減

