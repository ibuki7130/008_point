---
name: codegraph
description: "コードベース知識グラフ検索・影響分析。「コードの依存関係」「この関数の呼び出し元」「変更の影響範囲」などで発動。"
allowed-tools: Read, Bash
risk: safe
source: self
effort: low
---

# CodeGraph — コードベース知識グラフ

codebase-memory-mcp を使ったコード構造の即時検索・影響分析スキル。

## 発動条件

以下のような質問・指示で自動発動:
- 「この関数はどこから呼ばれてる？」
- 「依存関係を教えて」
- 「このファイルを変えたら何に影響する？」
- 「アーキテクチャの全体像は？」
- 「コードの構造を把握したい」

## 使い方

### 1. コード検索（Grep/Readの前に優先使用）

```bash
cd ~/taisun_agent && ./tools/codebase-memory-mcp/codebase-memory-mcp cli search_code \
  '{"project": "Users-matsumototoshihiko-taisun_agent", "pattern": "検索キーワード"}'
```

### 2. 呼び出しパス追跡

```bash
cd ~/taisun_agent && ./tools/codebase-memory-mcp/codebase-memory-mcp cli trace_call_path \
  '{"project": "Users-matsumototoshihiko-taisun_agent", "symbol": "関数名"}'
```

### 3. 変更影響分析（git diff連携）

```bash
cd ~/taisun_agent && ./tools/codebase-memory-mcp/codebase-memory-mcp cli detect_changes \
  '{"project": "Users-matsumototoshihiko-taisun_agent"}'
```

### 4. アーキテクチャ全体像

```bash
cd ~/taisun_agent && ./tools/codebase-memory-mcp/codebase-memory-mcp cli get_architecture \
  '{"project": "Users-matsumototoshihiko-taisun_agent", "aspects": ["summary"]}'
```

### 5. グラフクエリ（Cypher風）

```bash
cd ~/taisun_agent && ./tools/codebase-memory-mcp/codebase-memory-mcp cli query_graph \
  '{"project": "Users-matsumototoshihiko-taisun_agent", "query": "MATCH (f)-[e]->(t) WHERE f.name CONTAINS \"auth\" RETURN f.name, e.kind, t.name LIMIT 10"}'
```

## 自動更新

PostToolUseフック（codegraph-auto-index.js）により、Write/Edit後に自動でインデックスが更新されます。手動での再インデックスは不要です。

## インデックス状態確認

```bash
cd ~/taisun_agent && ./tools/codebase-memory-mcp/codebase-memory-mcp cli list_projects '{}'
```

## 注意事項

- MCP経由（次セッション以降）ではClaude Codeが自動的にツールを選択します
- CLIモードでは `project` パラメータに `Users-matsumototoshihiko-taisun_agent` を指定
- インデックスはSQLiteファイルとしてローカルに保存（数十MB）
