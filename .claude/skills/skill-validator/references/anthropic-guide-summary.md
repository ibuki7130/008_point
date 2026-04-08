# Anthropic Skill Building Guide - Summary

Based on: **The Complete Guide to Building Skills for Claude** (January 2026, 33 pages)

## Core Concepts

### Skill Structure
```
skill-name/
├── SKILL.md        # Required
├── scripts/        # Optional: executable code
├── references/     # Optional: documentation
└── assets/         # Optional: templates, fonts
```

### Progressive Disclosure (3 Levels)
1. **Level 1**: YAML frontmatter → Always in system prompt
2. **Level 2**: SKILL.md body → Loaded when triggered
3. **Level 3**: references/ files → Loaded as needed

## YAML Frontmatter Requirements

### Required Fields
```yaml
---
name: skill-name-kebab-case
description: |
  What it does. Use when user says "specific phrase".
  Do NOT use for: unrelated tasks.
---
```

### Optional Fields
```yaml
license: MIT
compatibility: Claude Code, macOS
metadata:
  author: Your Name
  version: 1.0.0
  mcp-server: server-name
```

### Forbidden
- XML tags (< or >) in frontmatter
- "claude" or "anthropic" in name
- Spaces or capitals in name

## Description Best Practices

### Good Description
```yaml
description: |
  Analyzes Figma design files and generates developer handoff
  documentation. Use when user uploads .fig files, asks for
  "design specs", "component documentation", or "design-to-code
  handoff". Do NOT use for: wireframe creation or UX research.
```

### Bad Description
```yaml
description: Helps with projects.  # Too vague
description: Creates sophisticated systems.  # No triggers
```

## Three Skill Categories

### Category 1: Document & Asset Creation
- Creating documents, presentations, code
- Template-based output
- Quality checklists
- Example: frontend-design, docx, pptx skills

### Category 2: Workflow Automation
- Multi-step processes
- MCP coordination
- Validation gates
- Example: skill-creator, onboarding flows

### Category 3: MCP Enhancement
- Tool access guidance
- Best practices for tool usage
- Error handling for MCP
- Example: sentry-code-review

## Five Workflow Patterns

### Pattern 1: Sequential Workflow
```markdown
## Step 1: Create Account
Call MCP tool: `create_customer`

## Step 2: Setup Payment
Wait for: payment verification

## Step 3: Send Confirmation
Call MCP tool: `send_email`
```

### Pattern 2: Multi-MCP Coordination
```markdown
## Phase 1: Export (Figma MCP)
## Phase 2: Storage (Drive MCP)
## Phase 3: Tasks (Linear MCP)
## Phase 4: Notify (Slack MCP)
```

### Pattern 3: Iterative Refinement
```markdown
## Initial Draft
Generate first version

## Quality Check
Run: scripts/validate.py

## Refinement Loop
Repeat until quality threshold met
```

### Pattern 4: Context-aware Selection
```markdown
## Decision Tree
- Large files → Cloud storage MCP
- Documents → Notion MCP
- Code files → GitHub MCP
```

### Pattern 5: Domain Intelligence
```markdown
## Compliance Check
1. Check sanctions lists
2. Verify jurisdiction
3. Assess risk level

## Processing (if passed)
Execute with domain rules applied
```

## Testing Approach

### 1. Triggering Tests
- ✓ Triggers on obvious tasks
- ✓ Triggers on paraphrased requests
- ✗ Doesn't trigger on unrelated topics

### 2. Functional Tests
- Valid outputs generated
- API calls succeed
- Error handling works

### 3. Performance Comparison
Without skill: 15 messages, 12,000 tokens
With skill: 2 messages, 6,000 tokens

## Success Metrics

| Metric | Target |
|--------|--------|
| Trigger rate | 90% on relevant queries |
| Workflow completion | X tool calls |
| Failed API calls | 0 per workflow |
| User corrections | 0 needed |

## Troubleshooting

### Skill Doesn't Trigger
→ Add specific trigger phrases to description

### Over-triggering
→ Add negative triggers: "Do NOT use for..."

### Instructions Not Followed
→ Keep instructions concise, use bullet points

### Large Context Issues
→ Move details to references/, keep SKILL.md under 5000 words

## Distribution

### GitHub Hosting
1. Public repo with clear README (at repo level, not in skill folder)
2. Example usage with screenshots
3. Link from MCP documentation

### Organization Skills
- Admins deploy workspace-wide
- Automatic updates
- Centralized management

### API Access
- `/v1/skills` endpoint
- `container.skills` parameter in Messages API
- Works with Claude Agent SDK
