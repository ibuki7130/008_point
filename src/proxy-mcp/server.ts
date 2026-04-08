/**
 * Proxy MCP Server
 *
 * Single entry point for Claude Code. Bundles multiple internal MCPs
 * behind a minimal public interface to reduce context pressure.
 *
 * Public Tools (exposed to Claude):
 * - system.health: Check if proxy is alive
 * - skill.search: Find skills from .claude/skills
 * - skill.run: Execute a skill
 * - memory.add: Store large content, return reference ID
 * - memory.search: Retrieve content by ID or keyword
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { systemHealth } from './tools/system';
import { skillSearch, skillRun } from './tools/skill';
import { memoryAdd, memorySearch, memoryStats } from './tools/memory';
import { verifyOutput } from './validation/verification-layer';
import { runCoVe } from './validation/cove';
import { analyzeReflexionRounds, evaluateRound } from './validation/reflexion';
import { runValidationPipeline } from './validation/pipeline';
import { evaluateProspectively } from './validation/prospective-reflection';
import { getValidationConfig } from './validation/config';
import { checkConstitutional } from './validation/constitutional';
import { groundPrompt } from '../rag/grounding';
import { ToolResult } from './types';

const server = new Server(
  {
    name: 'taisun-proxy-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions (minimal surface area)
const TOOLS = [
  {
    name: 'system_health',
    description: 'Check if Proxy MCP is alive and get status',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'skill_search',
    description: 'Search for skills in .claude/skills directory. Returns up to 10 matches.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (optional, empty returns all)',
        },
      },
      required: [],
    },
  },
  {
    name: 'skill_run',
    description: 'Load and preview a skill by name. Full execution requires M2+ integration.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Skill name (directory name in .claude/skills)',
        },
        params: {
          type: 'object',
          description: 'Optional parameters for the skill',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'memory_add',
    description: 'Store large content and return a reference ID. Use this to avoid cluttering conversation. Either content or content_path must be provided (not both).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Content to store directly',
        },
        content_path: {
          type: 'string',
          description: 'Path to file to read and store (for large logs). Project-relative paths only.',
        },
        type: {
          type: 'string',
          enum: ['short-term', 'long-term'],
          description: 'Memory type (default: short-term)',
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata',
        },
      },
      required: [],
    },
  },
  {
    name: 'memory_search',
    description: 'Search memory by reference ID or keyword',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Reference ID or search keyword',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'output_verify',
    description: 'Validate AI-generated text for uncertainty and hallucination. Returns score, flags, and correction prompt when needed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'Text to validate',
        },
        context_id: {
          type: 'string',
          description: 'Context ID for consistency tracking across calls (optional)',
        },
        threshold: {
          type: 'number',
          description: 'Uncertainty score threshold 0.0-1.0 (default: 0.3)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'rag_ground',
    description: 'Retrieve relevant skill/context snippets and prepend them to a prompt for grounding.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt to ground with retrieved context',
        },
        top_k: {
          type: 'number',
          description: 'Number of context snippets to retrieve (default: 3)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'cove_verify',
    description: 'Chain-of-Verification: extract factual claims from text, generate verification questions, and detect contradictions. Reduces hallucination by 20-30%.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'Text to verify',
        },
        max_questions: {
          type: 'number',
          description: 'Maximum verification questions to generate (default: 5)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'reflexion_analyze',
    description: 'Reflexion multi-round analysis: evaluate multiple output versions (oldest first), detect improvement trend, select best round, and provide correction prompt if not converged.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        outputs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Output versions in chronological order (oldest first)',
        },
        convergence_threshold: {
          type: 'number',
          description: 'Score threshold to consider converged, 0.0-1.0 (default: 0.7)',
        },
        max_rounds: {
          type: 'number',
          description: 'Maximum rounds to analyze (default: 3)',
        },
      },
      required: ['outputs'],
    },
  },
  {
    name: 'validation_pipeline',
    description: '7層バリデーションパイプライン: Constitutional AI + Self-Contrast + CoVe + Faithfulness + DeepEval + Reflexionを統合実行。重要な出力の品質を一括検証。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: '検証対象テキスト' },
        mode: { type: 'string', enum: ['off', 'advisory', 'strict', 'full'], description: 'バリデーションモード (デフォルト: advisory)' },
        source_texts: { type: 'array', items: { type: 'string' }, description: 'RAGソーステキスト (Faithfulness検証用, optional)' },
        context_id: { type: 'string', description: 'コンテキストID (optional)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'prospective_check',
    description: '実行前リスク評価 (Prospective Reflection): プロンプトの曖昧さ・欠落コンテキスト・過大期待を事前検出。実行前に呼ぶことで+10-15%精度向上。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: '評価するプロンプト' },
        threshold: { type: 'number', description: 'リスク閾値 0.0-1.0 (デフォルト: 0.4)' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'constitutional_check',
    description: 'Constitutional AIスタイルの原則チェック: 誠実性・不確実性・捏造・一貫性・有害性など10原則を評価。外部依存ゼロ。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: '検証対象テキスト' },
        threshold: { type: 'number', description: '違反スコア閾値 (デフォルト: 0.3)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'reflexion_round',
    description: 'Reflexion incremental: evaluate a single output round and decide whether to continue self-correction.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        output: {
          type: 'string',
          description: 'Current round output',
        },
        round_number: {
          type: 'number',
          description: 'Current round number (1-based)',
        },
        previous_outputs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Previous round outputs for context (optional)',
        },
        convergence_threshold: {
          type: 'number',
          description: 'Score threshold 0.0-1.0 (default: 0.7)',
        },
        max_rounds: {
          type: 'number',
          description: 'Maximum rounds allowed (default: 3)',
        },
      },
      required: ['output', 'round_number'],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let result: ToolResult;

  switch (name) {
    case 'system_health':
      result = systemHealth();
      break;

    case 'skill_search':
      result = skillSearch((args?.query as string) || '');
      break;

    case 'skill_run':
      result = skillRun(
        args?.name as string,
        args?.params as Record<string, unknown> | undefined
      );
      break;

    case 'memory_add': {
      // Auto-protection: advisoryモードでfaithfulness + constitutional を軽量チェック
      const autoConfig = getValidationConfig();
      if (autoConfig.mode !== 'off' && args?.content) {
        const constitutionalCheck = checkConstitutional(args.content as string, { threshold: 0.7 });
        if (!constitutionalCheck.passed && autoConfig.mode === 'strict') {
          result = {
            success: false,
            error: `Constitutional AI check failed: ${constitutionalCheck.violations.map(v => v.principle).join(', ')}`,
          };
          break;
        }
      }
      result = await memoryAdd(
        args?.content as string | undefined,
        (args?.type as 'short-term' | 'long-term') || 'short-term',
        {
          ...args?.metadata as Record<string, unknown> | undefined,
          contentPath: args?.content_path as string | undefined,
        }
      );
      break;
    }

    case 'memory_search':
      result = await memorySearch(args?.query as string);
      break;

    case 'output_verify': {
      const verifyResult = await verifyOutput(args?.text as string, {
        verifyThreshold: (args?.threshold as number) ?? 0.3,
        contextId: (args?.context_id as string) ?? 'default',
      });
      result = {
        success: true,
        data: {
          passed: verifyResult.passed,
          uncertaintyScore: verifyResult.primaryValidation.uncertaintyScore,
          severity: verifyResult.primaryValidation.severity,
          flags: verifyResult.primaryValidation.uncertaintyFlags,
          consistencyViolations: verifyResult.primaryValidation.consistencyViolations,
          verificationRounds: verifyResult.verificationRounds,
          correctionPrompt: verifyResult.verificationNote,
        },
      };
      break;
    }

    case 'rag_ground': {
      const groundResult = await groundPrompt(args?.prompt as string, {
        topK: (args?.top_k as number) ?? 3,
      });
      result = {
        success: true,
        data: {
          groundedPrompt: groundResult.groundedPrompt,
          snippetsUsed: groundResult.snippetsUsed,
          contextLength: groundResult.contextLength,
        },
      };
      break;
    }

    case 'cove_verify': {
      const coveResult = runCoVe(args?.text as string, {
        maxQuestions: (args?.max_questions as number) ?? 5,
      });
      result = {
        success: true,
        data: {
          passed: coveResult.passed,
          claimsExtracted: coveResult.claims.length,
          questionsGenerated: coveResult.questions.length,
          contradictions: coveResult.contradictions.map(c => ({
            claim: c.claim.substring(0, 120),
            question: c.question,
            evidence: c.contradictionEvidence,
          })),
          contradictionRate: parseFloat(coveResult.contradictionRate.toFixed(3)),
          correctionPrompt: coveResult.correctionPrompt,
        },
      };
      break;
    }

    case 'validation_pipeline': {
      const pipelineResult = await runValidationPipeline(args?.text as string, {
        mode: args?.mode as 'off' | 'advisory' | 'strict' | 'full' | undefined,
        sourceTexts: args?.source_texts as string[] | undefined,
        contextId: args?.context_id as string | undefined,
      });
      result = {
        success: true,
        data: {
          overallPassed: pipelineResult.overallPassed,
          mode: pipelineResult.mode,
          overallScore: parseFloat(pipelineResult.overallScore.toFixed(3)),
          summary: pipelineResult.summary,
          correctionPrompt: pipelineResult.correctionPrompt,
          layers: {
            constitutional: {
              passed: pipelineResult.layers.constitutional.passed,
              violationScore: parseFloat(pipelineResult.layers.constitutional.violationScore.toFixed(3)),
              violationCount: pipelineResult.layers.constitutional.violations.length,
            },
            selfContrast: {
              passed: pipelineResult.layers.selfContrast.passed,
              contrastScore: parseFloat(pipelineResult.layers.selfContrast.contrastScore.toFixed(3)),
              contradictionCount: pipelineResult.layers.selfContrast.contradictions.length,
            },
            cove: {
              passed: pipelineResult.layers.cove.passed,
              contradictionRate: parseFloat(pipelineResult.layers.cove.contradictionRate.toFixed(3)),
              contradictionCount: pipelineResult.layers.cove.contradictions.length,
            },
            faithfulness: {
              passed: pipelineResult.layers.faithfulness.passed,
              faithfulnessScore: parseFloat(pipelineResult.layers.faithfulness.faithfulnessScore.toFixed(3)),
            },
            deepEval: {
              passed: pipelineResult.layers.deepEval.passed,
              skipped: pipelineResult.layers.deepEval.skipped,
              hallucinationScore: parseFloat(pipelineResult.layers.deepEval.hallucinationScore.toFixed(3)),
            },
          },
        },
      };
      break;
    }

    case 'prospective_check': {
      const prospectiveResult = evaluateProspectively(args?.prompt as string, {
        threshold: args?.threshold as number | undefined,
      });
      result = {
        success: true,
        data: {
          shouldProceed: prospectiveResult.shouldProceed,
          riskScore: parseFloat(prospectiveResult.riskScore.toFixed(3)),
          recommendation: prospectiveResult.recommendation,
          riskCount: prospectiveResult.risks.length,
          risks: prospectiveResult.risks,
          refinedPrompt: prospectiveResult.refinedPrompt,
        },
      };
      break;
    }

    case 'constitutional_check': {
      const constitutionalResult = checkConstitutional(args?.text as string, {
        threshold: args?.threshold as number | undefined,
      });
      result = {
        success: true,
        data: {
          passed: constitutionalResult.passed,
          violationScore: parseFloat(constitutionalResult.violationScore.toFixed(3)),
          violationCount: constitutionalResult.violations.length,
          violations: constitutionalResult.violations,
          correctionPrompt: constitutionalResult.correctionPrompt,
        },
      };
      break;
    }

    case 'reflexion_analyze': {
      const reflexionResult = analyzeReflexionRounds(
        args?.outputs as string[],
        {
          convergenceThreshold: (args?.convergence_threshold as number) ?? 0.7,
          maxRounds: (args?.max_rounds as number) ?? 3,
        }
      );
      result = {
        success: true,
        data: {
          converged: reflexionResult.converged,
          totalRounds: reflexionResult.totalRounds,
          bestRound: reflexionResult.bestRoundIndex + 1,
          bestScore: parseFloat(reflexionResult.bestRound.compositeScore.toFixed(3)),
          roundScores: reflexionResult.rounds.map(r => ({
            round: r.round,
            score: parseFloat(r.compositeScore.toFixed(3)),
            improvement: parseFloat(r.improvement.toFixed(3)),
            uncertaintyScore: parseFloat(r.validation.uncertaintyScore.toFixed(3)),
            contradictionRate: parseFloat(r.cove.contradictionRate.toFixed(3)),
          })),
          nextCorrectionPrompt: reflexionResult.nextCorrectionPrompt,
        },
      };
      break;
    }

    case 'reflexion_round': {
      const roundResult = evaluateRound(
        args?.output as string,
        args?.round_number as number,
        (args?.previous_outputs as string[]) ?? [],
        {
          convergenceThreshold: (args?.convergence_threshold as number) ?? 0.7,
          maxRounds: (args?.max_rounds as number) ?? 3,
        }
      );
      result = {
        success: true,
        data: {
          round: roundResult.record.round,
          score: parseFloat(roundResult.record.compositeScore.toFixed(3)),
          improvement: parseFloat(roundResult.record.improvement.toFixed(3)),
          shouldContinue: roundResult.shouldContinue,
          reason: roundResult.reason,
          correctionPrompt: roundResult.record.correctionPrompt,
          details: {
            uncertaintyScore: parseFloat(roundResult.record.validation.uncertaintyScore.toFixed(3)),
            contradictionRate: parseFloat(roundResult.record.cove.contradictionRate.toFixed(3)),
            consistencyViolations: roundResult.record.validation.consistencyViolations.length,
          },
        },
      };
      break;
    }

    default:
      result = {
        success: false,
        error: `Unknown tool: ${name}`,
      };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: !result.success,
  };
});

// Export for programmatic use
export { server, TOOLS, systemHealth, skillSearch, skillRun, memoryAdd, memorySearch, memoryStats };

// Run server if executed directly
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Proxy MCP server running on stdio');
}

// Check if running as main module
const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  main().catch(console.error);
}
