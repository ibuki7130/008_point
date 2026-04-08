---
name: agent-catalog
description: 82エージェントの詳細カタログ。エージェント選択時に参照。
---

# Agent Catalog (82 Agents)

## Coordinators (5)
| Agent | Description |
|-------|-------------|
| `ait42-coordinator` | メインオーケストレーター |
| `ait42-coordinator-fast` | 高速O(1)選択 |
| `omega-aware-coordinator` | Ω関数理論 |
| `self-healing-coordinator` | 自己修復 |
| `initialization-orchestrator` | 環境セットアップ統合 |

## Diagnostics & Recovery (5)
| Agent | Description |
|-------|-------------|
| `system-diagnostician` | プロアクティブシステム診断 |
| `error-recovery-planner` | エラー回復計画 |
| `dependency-validator` | 依存関係検証 |
| `log-analyzer` | ログ解析・パターン検出 |
| `environment-doctor` | 環境診断・修復（初心者向け） |

## Architecture & Design (6)
- `system-architect`, `api-designer`, `database-designer`
- `security-architect`, `cloud-architect`, `ui-ux-designer`

## Development (6)
- `backend-developer`, `frontend-developer`, `api-developer`
- `database-developer`, `integration-developer`, `migration-developer`

## Quality Assurance (8)
- `code-reviewer`, `test-generator`, `qa-validator`
- `integration-tester`, `security-tester`, `performance-tester`
- `mutation-tester`, `chaos-engineer`

## Operations (8)
- `devops-engineer`, `cicd-manager`, `monitoring-specialist`
- `incident-responder`, `backup-manager`, `container-specialist`
- `config-manager`, `release-manager`

## Documentation (3)
- `tech-writer`, `doc-reviewer`, `knowledge-manager`

## Analysis (4)
- `complexity-analyzer`, `feedback-analyzer`
- `innovation-scout`, `learning-agent`

## Specialized (5)
- `bug-fixer`, `refactor-specialist`, `feature-builder`
- `script-writer`, `implementation-assistant`

## Multi-Agent (4)
- `multi-agent-competition`, `multi-agent-debate`
- `multi-agent-ensemble`, `reflection-agent`

## Process (5)
- `workflow-coordinator`, `integration-planner`
- `process-optimizer`, `metrics-collector`, `requirements-elicitation`

## Taiyou Agents (6)
- `taiyou-coordinator-agent`, `taiyou-codegen-agent`
- `taiyou-issue-agent`, `taiyou-pr-agent`
- `taiyou-review-agent`, `taiyou-deployment-agent`

## Specialized Tools (16+)
- Data analyst, Researcher, Automation architect, etc.

---

## Usage

エージェント選択はCoordinator経由で自動選択されます:
```
1. Coordinator経由で最適エージェント自動選択
2. 複雑タスクは並列実行
3. reflection-agentで品質ゲート
```
