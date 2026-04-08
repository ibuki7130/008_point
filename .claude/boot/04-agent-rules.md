# Agent運用ルール

## ECC（Everything Claude Code）スキル活用ルール

### 自動適用するECCスキル
| 場面 | 使用スキル |
|------|-----------|
| コードレビュー時 | coding-standards の基準を適用 |
| 新機能実装時 | tdd-workflow に従いテストファースト |
| 実装完了の判断時 | verification-loop で自動検証 |
| セキュリティに関わるコード変更時 | cc-skill-security-review を適用 |
| コンテキスト圧迫を検知した時 | strategic-compact の基準で判断 |

### リサーチ自動発動ルール（MUST）

以下のキーワードを検出したら、**必ず `/research-system` を起点として全リサーチスキルを使うこと**:

| トリガーワード | 使うスキル |
|--------------|-----------|
| 「リサーチして」「調査して」「調べて」「深掘りして」 | `/research-system`（全STEP実行） |
| 「リサーチスキル」「リサーチのスキル」「リサーチを使って」 | `/research-system`（全STEP実行） |
| 「ディープリサーチ」「徹底調査」「全力リサーチ」 | `/research-system`（全STEP実行） |
| 「市場調査」「競合調査」「トレンド調査」 | `/research-system`（全STEP実行） |
| 「情報を探して」「詳しく調べて」「全部調べて」 | `/research-system`（全STEP実行） |
| 「無料リサーチ」「フリーリサーチ」「コストゼロで調査」 | `/research-system-free`（APIキー不要版） |
| 「動画ダウンロード」「動画を保存」「YouTubeダウンロード」 | `/video-download`（yt-dlp） |
| 「Instagramダウンロード」「TikTokダウンロード」「リール保存」 | `/video-download`（yt-dlp） |
| 「Udemyダウンロード」「コースダウンロード」「講座を保存」 | `/udemy-download`（コース一括DL） |
| 「文字起こし」「トランスクリプト」「字幕取得」 | `/video-download` + 字幕オプション |

`/research-system` は内部で以下を全て自動起動する:
- `/intelligence-research` `/mega-research` `/mega-research-plus`
- `/deep-research` `/deep-research-grok` `/omega-research`
- `/world-research` `/gem-research` `/opencli-research`
- `/note-research` `/exa-search` `/firecrawl`

### OpenCode（セカンドエンジン）
- 通常時: 使わない（Claude Code + TAISUNで十分）
- テストが通らないバグ: `/opencode-fix` で別視点の修正案を取得
- Ralph Loopは既定OFF。使う時だけONにし、完了後は必ずOFFに戻す

## CodeGraph（コードベース知識グラフ）

codebase-memory-mcp がMCPサーバーとして登録済み。

### メモリ責務分離
| 保存データ | 保存先 |
|-----------|--------|
| ユーザー情報・フィードバック | MEMORY.md（SSoT） |
| コード構造（関数/クラス/依存） | codebase-memory-mcp |

### 活用方法
- コード探索時: codebase-memoryのsearch_code/query_graphを優先使用
- 変更影響分析: trace_call_path/detect_changesで事前確認

## Hook Safety
- Project-level hooks **never block** (advisory-only, exit 0)
- Only `unified-guard` blocks: `rm -rf /`, `mkfs`, `dd if=/dev`, fork bombs

## MCP Caution
- Each MCP server consumes 1,000–26,000 tokens on load
- Keep active MCP ≤ 10
- Disable unnecessary servers in `.claude/settings.json` → `disabledMcpServers`
