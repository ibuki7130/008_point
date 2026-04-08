# Architecture Decision Records (ADR)

実装判断の記録。「なぜそう実装したか」を残す。

## 命名規則
`YYYYMMDD-NNN-title.md`

## ステータス
- `proposed` — 提案中
- `accepted` — 採用
- `deprecated` — 廃止
- `superseded` — 後継ADRあり

## 自動生成
重要ファイル編集時に `.claude/hooks/auto-adr.js` が自動生成を提案する。
手動作成: `node .claude/hooks/auto-adr.js --manual`
