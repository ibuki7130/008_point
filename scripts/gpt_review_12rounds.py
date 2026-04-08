#!/usr/bin/env python3
"""
TAISUN CodeGraph 提案 — ChatGPT 5.4 thinking × 12回反復レビュー
OpenRouter API経由で実行
"""
import os
import sys
import json
import time
from datetime import datetime
from openai import OpenAI

# Setup
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
    default_headers={
        "HTTP-Referer": "https://taisun-agent.local",
        "X-Title": "TAISUN v2 QA Gate - 12 Rounds",
    },
)

MODEL = "openai/gpt-5.4"
REPORT_PATH = os.path.expanduser("~/taisun_agent/research/runs/20260321__codegraph-proposal/review_for_chatgpt.md")
OUTPUT_DIR = os.path.expanduser("~/Desktop/最終GPT報告レポート")

with open(REPORT_PATH, "r") as f:
    review_doc = f.read()

# 12 rounds of review with different perspectives
ROUND_PROMPTS = [
    {
        "round": 1,
        "role": "シニアソフトウェアアーキテクト",
        "focus": "アーキテクチャ設計の妥当性。既存OSSツール2つの併用という判断は正しいか？MCP統合の設計に穴はないか？",
    },
    {
        "round": 2,
        "role": "セキュリティエンジニア",
        "focus": "Go製バイナリのcurlインストールリスク、MCPサーバーのサプライチェーン攻撃リスク、データ漏洩リスク、依存関係の脆弱性",
    },
    {
        "round": 3,
        "role": "プロダクトマネージャー",
        "focus": "ビジネス価値、ROI、導入の優先度。本当に今必要か？他に優先すべき機能はないか？",
    },
    {
        "round": 4,
        "role": "DevOpsエンジニア",
        "focus": "運用負荷、障害時の復旧、監視、ログ、バックアップ。本番運用で何が問題になるか？",
    },
    {
        "round": 5,
        "role": "コスト最適化スペシャリスト",
        "focus": "隠れたコスト（運用時間、学習コスト、トラブルシューティング、ディスク、メモリ、CPU）の洗い出し。$0/月は本当か？",
    },
    {
        "round": 6,
        "role": "QAエンジニア",
        "focus": "テスト戦略、品質保証。2ツール併用時の統合テスト、回帰テスト、パフォーマンステストの計画はあるか？",
    },
    {
        "round": 7,
        "role": "データエンジニア",
        "focus": "データモデル、スキーマ設計、データ整合性。SQLiteの制約、グラフデータの永続性、バックアップ戦略",
    },
    {
        "round": 8,
        "role": "UX/DXリサーチャー",
        "focus": "開発者体験。導入の学習曲線、エラーメッセージの品質、ドキュメント、オンボーディング",
    },
    {
        "round": 9,
        "role": "オープンソースメンテナ",
        "focus": "OSS依存リスク。Stars数と実際の品質の乖離、メンテナ離脱リスク、フォーク戦略、ライセンス互換性",
    },
    {
        "round": 10,
        "role": "パフォーマンスエンジニア",
        "focus": "スケーラビリティ。900ファイル→9000ファイルへのスケール、インデックス更新の遅延、メモリ使用量、CPU負荷",
    },
    {
        "round": 11,
        "role": "競合分析アナリスト",
        "focus": "市場での差別化。GitNexus、Sourcegraph、CodeQL等との比較。TAISUN独自の競争優位性は本物か？",
    },
    {
        "round": 12,
        "role": "CTO（最終判断者）",
        "focus": "前11回のレビュー結果を踏まえた最終判断。Go/No-Go判定。最も重要なリスクTOP3と、それでも進めるべき理由",
    },
]

all_results = []
accumulated_feedback = ""

print("=" * 60)
print("TAISUN CodeGraph — ChatGPT 5.4 thinking × 12回反復レビュー")
print("=" * 60)

for rp in ROUND_PROMPTS:
    round_num = rp["round"]
    print(f"\n--- Round {round_num}/12: {rp['role']} ---")

    if round_num == 12:
        # Final round: CTO gets all previous feedback
        prompt = f"""あなたは{rp['role']}です。

以下の「TAISUN CodeGraph 導入提案」と、これまでの11名のレビュアーからのフィードバックを読んで、最終判断を下してください。

## レビュー観点
{rp['focus']}

## 出力フォーマット（必ず守ること）
### Round {round_num}: {rp['role']}
**評価: [A/B/C/D/F]**
**Go/No-Go: [Go / Conditional Go / No-Go]**

#### 最も重要なリスクTOP 3
1. [リスク1]
2. [リスク2]
3. [リスク3]

#### それでも進めるべき理由TOP 3
1. [理由1]
2. [理由2]
3. [理由3]

#### 必須条件（これをクリアしなければGo判定を出せない）
- [条件1]
- [条件2]
- [条件3]

#### 総評（200文字以内）
[総評]

---

## 提案書
{review_doc[:6000]}

## これまでのレビュー結果（11名分）
{accumulated_feedback[-4000:]}
"""
    else:
        prompt = f"""あなたは{rp['role']}です。

以下の「TAISUN CodeGraph 導入提案」を、あなたの専門領域の視点から厳しくレビューしてください。

## レビュー観点
{rp['focus']}

## 出力フォーマット（必ず守ること）
### Round {round_num}: {rp['role']}
**評価: [A/B/C/D/F]**

#### 良い点（2-3個）
- [良い点]

#### 問題点・懸念（3-5個）
- [問題点]

#### 改善提案（2-3個）
- [改善提案]

#### スコア: [0-100]/100

---

## 提案書
{review_doc[:6000]}

{"## 前回までのフィードバック（参考）" + chr(10) + accumulated_feedback[-2000:] if accumulated_feedback else ""}
"""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
        )
        result = response.choices[0].message.content
        all_results.append({"round": round_num, "role": rp["role"], "focus": rp["focus"], "result": result})
        accumulated_feedback += f"\n\n### Round {round_num} ({rp['role']})\n{result}\n"
        print(f"  完了 (tokens: {response.usage.total_tokens if response.usage else 'N/A'})")

        # Save intermediate result
        safe_role = rp['role'].replace('/', '_')
        with open(os.path.join(OUTPUT_DIR, f"round_{round_num:02d}_{safe_role}.md"), "w") as f:
            f.write(f"# Round {round_num}: {rp['role']}\n\n{result}")

        # Rate limit protection
        time.sleep(2)

    except Exception as e:
        print(f"  エラー: {e}")
        # Retry once with fallback model
        try:
            print(f"  リトライ中 (gpt-4o fallback)...")
            response = client.chat.completions.create(
                model="openai/gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.4,
            )
            result = response.choices[0].message.content
            all_results.append({"round": round_num, "role": rp["role"], "focus": rp["focus"], "result": result})
            accumulated_feedback += f"\n\n### Round {round_num} ({rp['role']})\n{result}\n"
            print(f"  フォールバック完了")
            safe_role = rp['role'].replace('/', '_')
            with open(os.path.join(OUTPUT_DIR, f"round_{round_num:02d}_{safe_role}.md"), "w") as f:
                f.write(f"# Round {round_num}: {rp['role']}\n\n{result}")
            time.sleep(2)
        except Exception as e2:
            print(f"  フォールバックも失敗: {e2}")
            all_results.append({"round": round_num, "role": rp["role"], "focus": rp["focus"], "result": f"エラー: {e2}"})

# Generate final consolidated report
print("\n\n" + "=" * 60)
print("最終統合レポート生成中...")
print("=" * 60)

now = datetime.now()
date_str = now.strftime("%Y-%m-%d")
title = f"TAISUN_CodeGraph_最終GPT報告レポート_{date_str}"

final_report = f"""# TAISUN CodeGraph — 最終GPT報告レポート

> 実行日: {now.strftime("%Y年%m月%d日 %H:%M")}
> モデル: ChatGPT 5.4 thinking (OpenRouter経由)
> レビュー回数: {len(all_results)}回
> レビュアー: 12名の専門家ペルソナによる多角的レビュー

---

## レビュアー一覧

| Round | 役割 | 観点 |
|-------|------|------|
"""

for rp in ROUND_PROMPTS:
    final_report += f"| {rp['round']} | {rp['role']} | {rp['focus'][:40]}... |\n"

final_report += "\n---\n\n"

# Add all results
for r in all_results:
    final_report += f"\n{r['result']}\n\n---\n\n"

# Add summary section
scores = []
for r in all_results:
    text = r["result"]
    import re
    score_match = re.search(r'スコア[：:]\s*(\d+)', text)
    if score_match:
        scores.append(int(score_match.group(1)))

avg_score = sum(scores) / len(scores) if scores else 0

final_report += f"""
## 統合サマリー

### スコア集計

| 指標 | 値 |
|------|-----|
| レビュー完了数 | {len(all_results)}/12 |
| 平均スコア | {avg_score:.1f}/100 |
| 最高スコア | {max(scores) if scores else 'N/A'}/100 |
| 最低スコア | {min(scores) if scores else 'N/A'}/100 |

### 全ラウンドで共通して指摘された事項

（各ラウンドの問題点から抽出）

### レポート生成情報

- 生成日時: {now.strftime("%Y-%m-%d %H:%M:%S")}
- 使用モデル: ChatGPT 5.4 thinking (OpenRouter)
- 反復回数: 12回
- 対象: TAISUN CodeGraph 導入提案
"""

# Save final report
final_path = os.path.join(OUTPUT_DIR, f"{title}.md")
with open(final_path, "w") as f:
    f.write(final_report)

print(f"\n最終レポート保存: {final_path}")
print(f"スコア集計: 平均 {avg_score:.1f}/100 ({len(scores)}件)")
print("完了!")
