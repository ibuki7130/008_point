# コンテキスト倉庫システム 診断レポート

**診断日時**: 2026-02-15
**対象**: taisun_agent2026プロジェクト

---

## 📊 現状分析

### 1. スキル倉庫システム 稼働状況

| 項目 | 現状 | 期待動作 | 判定 |
|------|------|----------|------|
| **スキル自動マッピング** | ✅ 稼働中 | タスク種別から必須スキルを自動検出 | **正常** |
| **skill-usage-guard.js** | ✅ 稼働中 | UserPromptSubmitで実行 | **正常** |
| **skill-mapping.json** | ✅ 設定済 | 32種類のトリガー登録 | **正常** |
| **スキル数** | 192ファイル | - | **要最適化** |
| **グローバルスキル数** | 17個 | - | 適正 |

#### スキル自動呼び出しロジック

```javascript
// .claude/hooks/skill-usage-guard.js (v3.0)
// ✅ 正常稼働中

フロー:
1. UserPromptSubmit時に入力テキストを解析
2. skill-mapping.jsonのトリガーと照合
3. 一致した場合、必須スキルをコンテキストに注入
4. strict: true の場合はブロック、false の場合は警告のみ
```

**検証結果**:
- ✅ トリガーベースの自動検出は**正常稼働**
- ✅ 明示的なスキル指定（「〇〇スキルを使って」）も検出
- ✅ スラッシュコマンド（/mega-research-plus）も検出

**問題点**:
- ⚠️ スキル自体はセッション開始時に**全タイトルがコンテキストにロード**される
- ⚠️ 192個のスキルファイル × 平均50行 = **約9,600行**が潜在的負荷
- ⚠️ 「倉庫に置いて必要時のみロード」は**部分的にしか実現されていない**

### 2. MCP倉庫システム 稼働状況

| 項目 | 現状 | 期待動作 | 判定 |
|------|------|----------|------|
| **MCP Tool Search** | ✅ 有効化 | ツールを事前ロードせず動的検索 | **正常** |
| **tengu_mcp_tool_search** | `true` | GrowthBook経由で有効 | **正常** |
| **disabledMcpServers** | ❌ 未設定 | 不要MCPを無効化 | **未実装** |
| **ENABLE_TOOL_SEARCH** | ❌ 未設定 | 環境変数でカスタム制御 | **未設定** |

#### MCP Tool Search 稼働確認

```json
// ~/.claude.json (行52)
"tengu_mcp_tool_search": true
```

**検証結果**:
- ✅ Anthropic公式のMCP Tool Searchは**有効化済み**
- ✅ ツールスキーマの事前ロードは**85%削減されているはず**
- ❌ プロジェクト別のMCP無効化設定は**未実装**

**問題点**:
- ⚠️ 8個のMCPサーバー全てが有効化されたまま
- ⚠️ 不要なMCPサーバーを無効化していない
- ⚠️ 各MCPサーバーが500-2000トークン消費している可能性

### 3. 実際のトークン消費量（推定）

| レイヤー | 項目 | 推定消費 | 根拠 |
|---------|------|----------|------|
| **システム** | システムプロンプト | 5-10K | 固定 |
| **スキル** | 192スキルのタイトル+description | 15-25K | ❌ 最大の問題 |
| **MCP** | 8サーバーのツールスキーマ（Tool Search後） | 2-5K | ✅ Tool Searchで削減済み |
| **CLAUDE.md** | プロジェクトルール | 5K | 要最適化 |
| **バッファ** | 応答生成バッファ | 40-45K | 固定 |
| **合計消費** | - | **67-90K** | - |
| **実作業領域** | - | **110-133K** | 200K - 消費 |

---

## 🔍 倉庫システムの実装状況

### ✅ 正しく稼働している部分

1. **スキル自動マッピング（skill-usage-guard.js）**
   - タスク種別からスキルを自動検出
   - 必須スキルをコンテキストに注入
   - strict modeで未使用時にブロック

2. **MCP Tool Search**
   - Anthropic公式機能が有効化済み
   - ツールスキーマの事前ロード85%削減

### ❌ 正しく稼働していない部分

1. **スキルの完全倉庫化**
   - 現状: セッション開始時に**全スキルのタイトル+descriptionがロード**
   - 期待: タイトルのみロード、本文は呼び出し時のみ
   - **実装不足**: `disable-model-invocation: true` 設定が未適用

2. **MCPサーバーの選択的有効化**
   - 現状: 8個全て有効化
   - 期待: プロジェクトに必要なMCPのみ有効化
   - **実装不足**: `disabledMcpServers` 設定が未設定

3. **instructions.md分離パターン**
   - 現状: 192スキル中、分離実装済みは**不明**（要確認）
   - 期待: 全スキルでinstructions.md分離
   - **実装不足**: 全スキルへの適用が未完了

---

## 📈 改善の優先順位

### Tier 1: 即効性が高く、実装容易（推定効果: 40-60%削減）

| # | 対策 | 推定効果 | 難易度 | 実装時間 |
|---|------|----------|--------|----------|
| 1 | **disable-model-invocation設定** | 10-15K削減 | 低 | 30分 |
| 2 | **不要MCP無効化** | 2-5K削減 | 低 | 15分 |
| 3 | **スキルdescription英語化** | 5-10K削減 | 中 | 2-3時間 |

### Tier 2: 中期的効果（推定効果: 30-50%削減）

| # | 対策 | 推定効果 | 難易度 | 実装時間 |
|---|------|----------|--------|----------|
| 4 | **instructions.md分離（全スキル）** | compact後の削減 | 中 | 半日 |
| 5 | **CLAUDE.md Progressive Disclosure化** | 2-3K削減 | 中 | 2-3時間 |
| 6 | **スキル統合・整理** | 5-10K削減 | 高 | 1日 |

---

## 🎯 推奨アクション

### Phase 1（今日実施可能）

```bash
# 1. 不要MCPサーバーを無効化
# .claude/settings.json に追加
{
  "disabledMcpServers": [
    "pexels",      # 画像生成時のみ必要
    "pixabay",     # 画像生成時のみ必要
    "puppeteer",   # ブラウザ操作時のみ必要
    "browser-use"  # ブラウザ操作時のみ必要
  ]
}

# 推定削減: 2-3K トークン
```

### Phase 2（明日実施）

```yaml
# 2. 手動スキルに disable-model-invocation 設定
# 各スキルのskill.mdに追加

---
name: mega-research-plus
description: 8-source integrated research system
disable-model-invocation: true  # ← 追加
---

# 対象: ユーザーが明示的に呼び出すスキル（約80個）
# 推定削減: 10-15K トークン
```

### Phase 3（来週実施）

```markdown
# 3. スキルdescriptionを英語化・短縮
# 例:
【変更前】
description: 8つの検索ソース（Tavily/SerpAPI/Brave/NewsAPI/Perplexity/Twitter/DuckDuckGo/WebSearch）を統合した最強リサーチシステム。API版＋MCP版＋組み込み版を完全統合。

【変更後】
description: 8-source integrated research system (API+MCP+Built-in)

# 推定削減: 50%トークン削減
```

---

## 📋 検証項目

次回セッションで確認すべき項目:

- [ ] MCP Tool Searchの実トークン消費量を測定
- [ ] 現在ロードされているスキル数を確認
- [ ] instructions.md分離済みスキル数を確認
- [ ] disabledMcpServers設定後のトークン削減量を測定
- [ ] disable-model-invocation設定後のトークン削減量を測定

---

## 結論

**倉庫システムの稼働状況**: 🟡 **部分稼働**

✅ **正常稼働**:
- スキル自動マッピング（skill-usage-guard.js）
- MCP Tool Search（Anthropic公式機能）

❌ **未実装・不十分**:
- スキルの完全倉庫化（disable-model-invocation未設定）
- MCPサーバーの選択的有効化（disabledMcpServers未設定）
- instructions.md分離の全スキル適用

**推奨**: Phase 1-3を順次実施し、真の「倉庫システム」を完成させる。
