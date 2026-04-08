# Core Rules（コアルール）

## WORKFLOW FIDELITY CONTRACT

### 1. Faithful Execution
When user says "same workflow" or "use XX skill", it is a **contract**.
- No shortcuts, simplifications, or substitutions
- Deviations require **explicit pre-approval**

### 2. Respect Existing Artifacts
- **Never create new scripts without Reading existing ones first**
- **Always Read before modifying any file**
- **Baseline-registered files are immutable**

### 3. No Unauthorized Actions
- Deviations MUST be confirmed: "This action is not in the instructions. May I proceed?"
- **Never deviate without explicit user approval**

### 4. Skill Compliance
When "use XX skill" is specified: **MUST use Skill tool**. Manual implementation is PROHIBITED.

**VIOLATION = CRITICAL ERROR** -> Stop -> Apologize -> Record in `.claude/hooks/mistakes.md` -> Re-execute correctly

## Pre-Flight Checks

Before starting work:
- [ ] Skill instruction? -> Use Skill tool
- [ ] "Same workflow"? -> Read existing files first
- [ ] SESSION_HANDOFF.md exists? -> Read it
- [ ] Summary ratio specified? -> Follow exactly

## Sub-Agent Context Protection (MANDATORY)

### Result Size Control
- **通常タスク**: `結果は500文字以内で要約して返してください`
- **リサーチ・列挙タスク**: `事実・URL・数値を省略せず返してください。不要な修飾語のみ削減`
- **ALL** research/analysis agents MUST use `run_in_background: true`

### Web Research Quality
- WebSearchで検索したら、**結果URLのうち最低3件はWebFetchで実際にページを開くこと**
- 検索結果のスニペットだけでレポートを書くことは**禁止**
- サブエージェントが「十分な情報が集まった」と自己判断して停止することは**禁止**
- 列挙タスク（「N件調査」）では、完了数を明示報告すること

### Delegation Pattern
- 3+ parallel agents: `run_in_background: true` **REQUIRED**
- After background agent completes: Read output file, extract key findings only

### Agent Checkpoint（重要Agent起動時の品質ゲート）

以下のAgent/スキル起動時、プロンプト末尾に **checkpoint 3問** を必ず追加:

**対象（checkpoint必須）:**
- リサーチ系: researcher, Explore(very thorough), research-system, mega-research, omega-research
- 実装系: implementer, feature-builder, bug-fixer, backend-developer, frontend-developer
- 設計系: architect, system-architect, api-designer, database-designer
- 要件定義系: requirements-elicitation, gather-requirements
- レビュー系: ReviewAgent, security-architect

**対象外:** Explore(quick/medium), code-searcher, debate, haiku

**追加するcheckpoint:**
```
--- AGENT CHECKPOINT（作業開始前に必ず内部回答せよ）---
Q1. あなたの役割を1行で述べよ（プロンプトから抽出）
Q2. 成果物の形式と制約は？（文字数制限・必須項目・WebFetch最低件数）
Q3. 完了条件は何か？（何をもって「完了」とするか）
回答後に作業開始。回答できない項目があればプロンプトを再読せよ。
```
