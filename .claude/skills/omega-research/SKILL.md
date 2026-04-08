---
name: omega-research
description: "最高精度統合リサーチ。Grok-4 Agent Tools Live Search + Exa セマンティック検索(精度81%/p95 1.4s) + Tavily + Brave + NewsAPI + intelligence-research(GIS 31ソース) + smolagents/HF InferenceClient(オープンモデル)を統合した最強スキル。market調査・競合分析・学術研究・技術調査・経済分析に対応。トリガー: 「最高精度リサーチ」「全力リサーチ」「omega-research」「完全調査」「最強リサーチ」「deep-research-grok」"
argument-hint: "[トピック] [--mode=deep|grok|api|intel|quick|academic|smolagents]"
allowed-tools: Read, Write, Bash(python3:*, pip:*, npx:*, cd:*)
model: opus
disable-model-invocation: true
effort: high
---

# Omega Research - 最高精度統合リサーチシステム v2

## パイプラインコンテキスト連携（v2.5）

`/tmp/taisun-pipeline/pipeline_context.json` が存在する場合、research-systemパイプラインの一部として実行中。
STEP 2 Pass 2（ギャップ補完）で呼ばれる際に、前STEPの発見事項と未解決項目に集中する。
品質基準 `ctx.scoring` に従い、hallucination_rate閾値を超える結果は自動除外する。

単独実行時（JSONが存在しない場合）は従来通り動作する。

---

Grok-4 + Exa API + 全API + GIS 31ソース + smolagents を統合した最強リサーチスキル。
旧 `deep-research-grok` の機能を完全統合済み（`--mode=quick` または `--mode=grok` で同等動作）。

## アーキテクチャ

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    OMEGA RESEARCH SYSTEM v2                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LAYER 1: LIVE WEB SEARCH (Grok-4 Agent Tools)                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  grok-4-0709 + tools=[{"type":"web_search"}]                       │    │
│  │  → 多段階リサーチ: 計画(grok-3-mini) → セクション調査 → 統合        │    │
│  │  quick/grok モード: 旧 deep-research-grok の scripts/research.py   │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  LAYER 2: API SEARCH (並列・Exa優先)                                        │
│  ┌──────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐       │
│  │   Exa    │  │ Tavily  │  │  Brave  │  │ NewsAPI │  │ SerpAPI  │       │
│  │セマンティ│  │AI特化   │  │広範囲   │  │最新News │  │ Google   │       │
│  │精度81%  │  │精度71%  │  │Web検索  │  │24h以内  │  │ 検索     │       │
│  │p95=1.4s │  │p95=4s   │  │         │  │         │  │          │       │
│  └──────────┘  └─────────┘  └─────────┘  └─────────┘  └──────────┘       │
│                                                                             │
│  LAYER 3: INTELLIGENCE (GIS 31ソース)                                      │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  RSS + HN + GitHub Trending + FRED経済指標 7系列                    │    │
│  │  + X/Twitter 340アカウント + Reddit + World Bank 4指標              │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  LAYER 4: ACADEMIC (deep/academic モードのみ)                               │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  Arxiv + Papers with Code + HF Daily + Lil'Log + Karpathy et al.  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  LAYER 5: OPEN MODELS (smolagents/HF InferenceClient)                      │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  HuggingFace InferenceClient + smolagents CodeAgent                │    │
│  │  → APIキー不要のオープンモデル代替・補完分析                          │    │
│  │  → 既存MCPサーバーをツールとして再利用 (MCPClient pattern)           │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │        SYNTHESIS ENGINE (Grok-4 final synthesis)                   │    │
│  │  重複排除 → クロス検証 → スコアリング → 統合レポート                  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────────┘
```

## 使い方

```
/omega-research AIエージェント市場の2026年最新動向
/omega-research "Claude Code vs Cursor vs Windsurf 徹底比較" --mode=deep
/omega-research 日本のSaaS市場 投資機会 --mode=api
/omega-research 量子コンピューティング 最新研究 --mode=academic
/omega-research 生成AI規制動向 --mode=intel
/omega-research Next.js 15の新機能 --mode=quick
/omega-research 市場調査 APIキーなしで --mode=smolagents
```

## モード一覧

| モード | 使用レイヤー | 所要時間 | 適した用途 |
|--------|------------|---------|----------|
| `deep` (デフォルト) | 全5レイヤー | 3-5分 | 市場調査・競合分析・意思決定 |
| `grok` | Layer 1のみ | 1-2分 | 最新情報・技術調査・速報 |
| `quick` | Layer 1 (2セクション) | 30-60秒 | 素早い概要確認（旧deep-research-grok互換） |
| `api` | Layer 1+2 (Exa優先) | 1-3分 | ファクト確認・クロス検証 |
| `intel` | Layer 1+3 | 2-4分 | 市場動向・経済指標・SNSトレンド |
| `academic` | Layer 1+4 | 3-5分 | 学術研究・論文調査・技術深掘り |
| `smolagents` | Layer 5 | 2-5分 | APIキー不要・オープンモデル活用 |

## 手順

### Step 1: 環境確認

```bash
cd $HOME/taisun_agent
python3 -c "import openai; print('OK')" 2>/dev/null || pip install openai python-dotenv -q
# smolagents モードの場合
python3 -c "import smolagents; print('OK')" 2>/dev/null || pip install smolagents -q
```

### Step 2: ARGUMENTSを解析

- `[トピック]` → リサーチテーマ
- `--mode=XXX` → モード（省略時: deep）

### Step 3: intelligence-research を並行起動（intel/deep モード）

`--mode=intel` または `--mode=deep` の場合:

```bash
cd $HOME/taisun_agent
npx ts-node src/intelligence/index.ts &
INTEL_PID=$!
```

### Step 4: メインスクリプト実行

#### deep / grok / api / intel / academic モード

```bash
cd $HOME/taisun_agent

python3 ~/.claude/skills/omega-research/scripts/research.py \
  "[TOPIC]" \
  --mode [MODE] \
  --output research/runs/$(date +%Y%m%d-%H%M%S)__omega-research
```

#### quick モード（旧 deep-research-grok 互換）

```bash
cd $HOME/taisun_agent

# 環境確認
python3 -c "import openai; print('OK')" 2>/dev/null || pip install openai python-dotenv -q

# 2セクション高速調査
python3 ~/.claude/skills/deep-research-grok/scripts/research.py \
  "[TOPIC]" --quick \
  --output research/runs/$(date +%Y%m%d)__omega-quick
```

#### smolagents モード（オープンモデル）

```bash
cd $HOME/taisun_agent

python3 -c "
import os
from smolagents import CodeAgent, HfApiModel, DuckDuckGoSearchTool, VisitWebpageTool

model = HfApiModel(model_id='Qwen/Qwen2.5-72B-Instruct', token=os.getenv('HF_TOKEN'))
agent = CodeAgent(
    tools=[DuckDuckGoSearchTool(), VisitWebpageTool()],
    model=model,
    max_steps=10
)
result = agent.run('[TOPIC] について包括的に調査し、日本語でMarkdownレポートを生成してください。')
print(result)
" 2>&1 | tee research/runs/$(date +%Y%m%d)__omega-smolagents/report.md
```

### Step 5: intelligence-research 結果の統合（intel/deep モード）

```bash
INTEL_REPORT=$(ls -t $HOME/taisun_agent/research/runs/*/intelligence-*.md 2>/dev/null | head -1)
```

### Step 6: Exa API 補完検索（api/deep モード）

Exa APIキーが設定されている場合、Layer 2 でセマンティック検索を実行:

```bash
cd $HOME/taisun_agent

python3 -c "
import os, json
try:
    from exa_py import Exa
    exa = Exa(os.environ.get('EXA_API_KEY'))
    results = exa.search_and_contents(
        '[TOPIC]',
        type='neural',
        num_results=10,
        text=True,
        use_autoprompt=True
    )
    for r in results.results[:5]:
        print(f'### {r.title}\n{r.url}\n{r.text[:500]}\n')
except ImportError:
    print('exa_py not installed: pip install exa-py')
except Exception as e:
    print(f'Exa API error (skip): {e}')
"
```

### Step 7: 結果確認と提示

生成されたMarkdownファイルを Read ツールで読み込み、以下の形式で提示:

```markdown
## 🔬 Omega Research Report - [トピック]
**モデル**: Grok-4 Agent Tools + Exa + [使用API]
**調査レイヤー**: [使用レイヤー]
**所要時間**: XX秒
**引用数**: XX件

### 📊 エグゼクティブサマリー
[サマリー内容]

### 🔑 主要な発見（Top 5）
- [発見1]
- [発見2]
- [発見3]
- [発見4]
- [発見5]

### 📈 データ・統計
[具体的数値]

### 🔗 全レポート
`research/runs/YYYYMMDD-HHMMSS__omega-research/omega_research_*.md`
```

## 各ソースの特徴

### Exa API（Layer 2 最優先）
- **SimpleQA精度**: 94.9%（Tavily 93.3%比 +1.6%）
- **p95レイテンシ**: 1.4-1.7秒（Tavily 4.5秒比 **3倍高速**）
- Neural embedding セマンティック検索で意味的に近いページを発見
- `EXA_API_KEY` 設定時に自動有効化（未設定時は Tavily にフォールバック）
- インストール: `pip install exa-py`

### Grok-4 Agent Tools（核心）
- xAI Grok-4 (grok-4-0709) のリアルタイムWeb検索
- `tools=[{"type": "web_search"}]` でAgent Tools APIを使用
- 検索→推論→再検索の多段階ループ
- 引用付き回答を生成 / 131k tokens コンテキスト

### smolagents / HF InferenceClient（Layer 5）
- **APIキー不要**（HF_TOKEN で無料利用可）
- `CodeAgent` pattern: LLMがPythonコードを生成して実行
- `MCPClient` で既存MCPサーバー（Tavily, Brave等）をツールとして再利用可
- 利用モデル例: `Qwen/Qwen2.5-72B-Instruct`, `meta-llama/Llama-3.3-70B-Instruct`
- Grok-4 APIが利用不可の環境でのフォールバックとして機能

### intelligence-research (GIS 31ソース)
- FRED経済指標 7系列（FFレート/CPI/失業率/GDP等）
- X/Twitter 著名人13名 + 監視アカウント340件
- HackerNews + GitHub Trending + Reddit コミュニティ
- World Bank 4指標

### Tavily API
- AI検索特化、セマンティック検索
- Exa未設定時のプライマリ検索ソース

## エラー対処

| エラー | 対処 |
|--------|------|
| `XAI_API_KEY not set` | `taisun_agent/.env` を確認 |
| `EXA_API_KEY not set` | Exa をスキップして Tavily で継続 |
| `openai not found` | `pip install openai python-dotenv` |
| `smolagents not found` | `pip install smolagents` |
| `exa-py not found` | `pip install exa-py` |
| intelligence-research タイムアウト | Step 3 をスキップして継続 |
| Tavily/Brave/NewsAPI エラー | 自動スキップ、Grok-4のみで継続 |
| Grok-4 Rate limit | 1秒間隔で自動リトライ |
| すべてのAPIが失敗 | `--mode=smolagents` にフォールバック |
