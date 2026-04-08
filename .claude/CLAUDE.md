# TAISUN v2 - Ultimate Unified System

## WORKFLOW FIDELITY CONTRACT

### 1. Faithful Execution
"same workflow" / "use XX skill" = **contract**. No shortcuts. Deviations require explicit pre-approval.

### 2. Respect Existing Artifacts
- **Never create new scripts without Reading existing ones first**
- **Always Read before modifying any file**
- **Baseline-registered files are immutable**

### 3. No Unauthorized Actions
Deviations MUST be confirmed: "This action is not in the instructions. May I proceed?"

### 4. Session Continuity
Check `.workflow_state.json` + `SESSION_HANDOFF.md` if present. Never contradict current phase.

### 5. Skill Compliance
"use XX skill" → **MUST use Skill tool**. Manual implementation PROHIBITED.

**VIOLATION = CRITICAL ERROR** → Stop → Apologize → Record in `.claude/hooks/mistakes.md` → Re-execute correctly

## Sub-Agent Context Protection (MANDATORY)

### Result Size Control
- 通常タスク: `結果は500文字以内で要約して返してください`
- リサーチ・列挙タスク: `事実・URL・数値を省略せず返してください`
- **ALL** research agents MUST use `run_in_background: true`

### Web Research Quality
- WebSearch後、**最低3件はWebFetchで実際にページを開くこと**
- スニペットだけでレポート作成は**禁止**
- 「十分な情報」の自己判断停止は**禁止**、指示件数を全て完了
- 列挙タスクは完了数を明示報告

### Delegation Pattern (MUST)
- **3+並列Agent: `run_in_background: true` 必須**（違反=context exhaustion）
- バックグラウンドAgent完了後: Read output file, extract key findings only
- Task結果 >2000文字 → 一時保存場所に退避 → `/compact`

### Context Safe Compact（コンパクト時の記憶保護・MUST）
巨大コンテキスト時は必ず以下の順序で実行:
1. **一時保存**: `.claude/temp-context/${session_id}/` に重要情報を書き出す
2. **/compact実行**: 要約済み内容も同ディレクトリに配置
3. **次ステップで参照**: `temp-context/` を必ずRead
4. **セッション終了時**: `temp-context/` を自動削除（session-end hook）

### Agent Checkpoint（重要Agent起動時）

**対象:** researcher, Explore(very thorough), research-system, mega-research, omega-research, implementer, feature-builder, bug-fixer, backend/frontend-developer, architect, system-architect, api-designer, database-designer, requirements-elicitation, ReviewAgent, security-architect

**対象外:** Explore(quick), code-searcher, debate, haiku

**プロンプト末尾に追加:**
```
--- AGENT CHECKPOINT ---
Q1. あなたの役割を1行で述べよ
Q2. 成果物の形式と制約は？（文字数・WebFetch件数）
Q3. 完了条件は何か？
```

## リサーチ自動発動ルール（MUST）

| トリガーワード | スキル |
|--------------|-------|
| リサーチ/調査/調べて/深掘り/情報を探して | `/research-system` |
| ディープリサーチ/徹底調査/全力リサーチ | `/research-system` |
| 市場/競合/トレンド調査 | `/research-system` |
| 無料/フリーリサーチ | `/research-system-free` |
| 動画/YouTube/Instagram/TikTokダウンロード | `/video-download` |
| Udemy/コースダウンロード | `/udemy-download` |
| 文字起こし/トランスクリプト | `/video-download` |

## Language
- Japanese priority / Technical terms in English OK

## Detailed References
- **ECC・OpenCode・CodeGraph・MCP・Hook Safety**: `.claude/references/CLAUDE-L2.md`
- **Specialized workflows**: `.claude/references/CLAUDE-L3.md`
