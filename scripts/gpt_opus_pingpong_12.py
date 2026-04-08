#!/usr/bin/env python3
"""
TAISUN CodeGraph — GPT-5.4 ↔ Opus 4.6 往復レビュー 12回
Round N: GPT-5.4が厳しくレビュー → Opus 4.6が俯瞰レビュー+次回GPT用指示ファイル作成
"""
import os
import sys
import json
import time
from datetime import datetime
from openai import OpenAI

# === Setup ===
openrouter = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
    default_headers={
        "HTTP-Referer": "https://taisun-agent.local",
        "X-Title": "TAISUN CodeGraph PingPong Review",
    },
)

anthropic = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
    default_headers={
        "HTTP-Referer": "https://taisun-agent.local",
        "X-Title": "TAISUN CodeGraph PingPong Review - Opus",
    },
)

GPT_MODEL = "openai/gpt-5.4"
OPUS_MODEL = "anthropic/claude-opus-4"
TOTAL_ROUNDS = 12

REPORT_PATH = os.path.expanduser("~/taisun_agent/research/runs/20260321__codegraph-proposal/review_for_chatgpt.md")
OUTPUT_DIR = os.path.expanduser("~/Desktop/最終GPT報告レポート")
os.makedirs(OUTPUT_DIR, exist_ok=True)

with open(REPORT_PATH, "r") as f:
    original_proposal = f.read()

# === Review focus per round ===
ROUND_FOCUS = [
    "アーキテクチャ設計の妥当性、MCP統合の設計に穴はないか",
    "セキュリティリスク、サプライチェーン攻撃、データ漏洩",
    "ビジネス価値、ROI、導入の優先度、本当に今必要か",
    "運用負荷、障害復旧、監視、ログ、バックアップ",
    "隠れたコスト、学習コスト、トラブルシューティング時間",
    "テスト戦略、品質保証、統合テスト計画",
    "データモデル、スキーマ設計、データ整合性、永続性",
    "開発者体験、学習曲線、オンボーディング、ドキュメント",
    "OSS依存リスク、メンテナ離脱、フォーク戦略、ライセンス",
    "スケーラビリティ、パフォーマンス、メモリ使用量",
    "市場差別化、競合分析、TAISUN独自の競争優位性",
    "全11回の往復を踏まえた最終Go/No-Go判定、リスクTOP3、推奨アクション",
]

all_gpt_reviews = []
all_opus_reviews = []
accumulated_context = ""

print("=" * 70)
print("TAISUN CodeGraph — GPT-5.4 ↔ Opus 4.6 往復レビュー 12回")
print("=" * 70)

for round_num in range(1, TOTAL_ROUNDS + 1):
    focus = ROUND_FOCUS[round_num - 1]
    print(f"\n{'='*70}")
    print(f"Round {round_num}/12 — テーマ: {focus[:40]}...")
    print(f"{'='*70}")

    # ========================================
    # STEP A: GPT-5.4 が厳しくレビュー
    # ========================================
    print(f"  [A] GPT-5.4 レビュー中...")

    if round_num == 1:
        gpt_prompt = f"""あなたは世界最高レベルのソフトウェアレビュアーです。
以下の提案書を**非常に厳しく**レビューしてください。甘い評価は禁止です。

## 今回のレビュー観点
{focus}

## レビュー指示
- 問題点を最低5個指摘すること
- 各問題に深刻度（Critical/High/Medium/Low）を付けること
- 「良い」という評価は根拠がない限り禁止
- 具体的な改善案を必ず付けること
- スコアは100点満点で厳しく採点（60点以下が普通）
- 抽象的な指摘は禁止。具体的なファイル名、ツール名、数値で指摘すること

## 出力フォーマット
### GPT-5.4 レビュー — Round {round_num}/12
**テーマ**: {focus}
**スコア**: XX/100

#### 問題点（深刻度順）
1. [Critical] ...
2. [High] ...
3. ...

#### 改善提案
1. ...
2. ...

#### このラウンドの結論（50文字以内）
...

---
## 提案書
{original_proposal[:5000]}
"""
    else:
        gpt_prompt = f"""あなたは世界最高レベルのソフトウェアレビュアーです。
前回のレビューに対してOpus 4.6が俯瞰レビューと追加指示を作成しました。
この指示に従い、さらに深く掘り下げてレビューしてください。

## 今回のレビュー観点
{focus}

## Opus 4.6 からの指示
{accumulated_context[-3000:]}

## レビュー指示
- Opusが指摘した「まだ不十分な点」を重点的に掘り下げること
- 前回の自分のレビューを踏まえて、新しい視点を追加すること
- 問題点を最低5個指摘すること（前回と重複しない新しい指摘を優先）
- 各問題に深刻度（Critical/High/Medium/Low）を付けること
- スコアは100点満点で厳しく採点
- 前回より甘い評価は禁止。同等か厳しくすること

## 出力フォーマット
### GPT-5.4 レビュー — Round {round_num}/12
**テーマ**: {focus}
**スコア**: XX/100

#### 問題点（深刻度順）
1. [Critical/High/Medium/Low] ...

#### 改善提案
1. ...

#### 前回からの改善点
...

#### まだ不十分な点
...

#### このラウンドの結論（50文字以内）
...

---
## 提案書（原文）
{original_proposal[:3000]}
"""

    try:
        gpt_response = openrouter.chat.completions.create(
            model=GPT_MODEL,
            messages=[{"role": "user", "content": gpt_prompt}],
            temperature=0.5,
        )
        gpt_result = gpt_response.choices[0].message.content
        all_gpt_reviews.append({"round": round_num, "focus": focus, "result": gpt_result})
        print(f"  [A] GPT-5.4 完了 (tokens: {gpt_response.usage.total_tokens if gpt_response.usage else 'N/A'})")
    except Exception as e:
        print(f"  [A] GPT-5.4 エラー: {e}")
        try:
            print(f"  [A] gpt-4o フォールバック...")
            gpt_response = openrouter.chat.completions.create(
                model="openai/gpt-4o",
                messages=[{"role": "user", "content": gpt_prompt}],
                temperature=0.5,
            )
            gpt_result = gpt_response.choices[0].message.content
            all_gpt_reviews.append({"round": round_num, "focus": focus, "result": gpt_result})
            print(f"  [A] フォールバック完了")
        except Exception as e2:
            gpt_result = f"エラー: {e2}"
            all_gpt_reviews.append({"round": round_num, "focus": focus, "result": gpt_result})
            print(f"  [A] フォールバックも失敗: {e2}")

    # Save GPT review
    safe_focus = focus[:20].replace('/', '_').replace(' ', '_')
    with open(os.path.join(OUTPUT_DIR, f"round_{round_num:02d}_A_GPT_{safe_focus}.md"), "w") as f:
        f.write(gpt_result)

    time.sleep(2)

    # ========================================
    # STEP B: Opus 4.6 が俯瞰レビュー + 次回GPT用指示作成
    # ========================================
    print(f"  [B] Opus 4.6 俯瞰レビュー中...")

    if round_num == TOTAL_ROUNDS:
        opus_prompt = f"""あなたはClaude Opus 4.6です。シニアアーキテクトとして、12回の往復レビュー全体を俯瞰して最終統合レポートを作成してください。

## これまでの全GPTレビュー結果
{chr(10).join([f"### Round {r['round']}: {r['focus'][:30]}...{chr(10)}{r['result'][:500]}" for r in all_gpt_reviews])}

## タスク
1. 12回のレビューで指摘された全問題点を深刻度別に整理
2. 最も重要なリスクTOP 5を特定
3. Go/No-Go の最終判定
4. 導入する場合の必須条件（これをクリアしないと進めない）
5. 推奨アクションプラン（優先順位付き）

## 出力フォーマット
### Opus 4.6 最終統合レビュー — Round {round_num}/12（最終）

#### 12回レビューの統計
- Critical問題数: X
- High問題数: X
- Medium問題数: X
- Low問題数: X

#### 最重要リスクTOP 5
1. ...

#### Go/No-Go 最終判定
[Go / Conditional Go / No-Go]

#### 必須条件（Goの場合）
1. ...

#### 推奨アクションプラン
1. ...

#### 総評（300文字以内）
...
"""
    else:
        opus_prompt = f"""あなたはClaude Opus 4.6です。シニアアーキテクトとして、GPT-5.4のレビュー結果を俯瞰してレビューしてください。

## GPT-5.4 のレビュー結果（Round {round_num}）
{gpt_result}

## 原提案書
{original_proposal[:2000]}

## タスク
1. GPT-5.4のレビューの質を評価（的を射ているか、見当違いな指摘はないか）
2. GPTが見落としている重要な問題点を追加
3. GPTの指摘に対する反論や補足（必要な場合）
4. 次回Round {round_num + 1}でGPT-5.4が重点的にレビューすべきポイントを指示

## 出力フォーマット
### Opus 4.6 俯瞰レビュー — Round {round_num}/12

#### GPTレビューの質の評価
- 的確な指摘: ...
- 見当違いな指摘: ...
- 見落とし: ...

#### Opusからの追加指摘
1. ...

#### 次回Round {round_num + 1}への指示
**テーマ**: {ROUND_FOCUS[round_num] if round_num < TOTAL_ROUNDS else '最終判定'}
以下の点を重点的にレビューしてください:
1. ...
2. ...
3. ...

#### まだ解決していない課題リスト
- ...
"""

    try:
        opus_response = anthropic.chat.completions.create(
            model=OPUS_MODEL,
            messages=[{"role": "user", "content": opus_prompt}],
            temperature=0.3,
        )
        opus_result = opus_response.choices[0].message.content
        all_opus_reviews.append({"round": round_num, "result": opus_result})
        accumulated_context = opus_result
        print(f"  [B] Opus 4.6 完了 (tokens: {opus_response.usage.total_tokens if opus_response.usage else 'N/A'})")
    except Exception as e:
        print(f"  [B] Opus 4.6 エラー: {e}")
        try:
            print(f"  [B] Claude Sonnet フォールバック...")
            opus_response = anthropic.chat.completions.create(
                model="anthropic/claude-sonnet-4",
                messages=[{"role": "user", "content": opus_prompt}],
                temperature=0.3,
            )
            opus_result = opus_response.choices[0].message.content
            all_opus_reviews.append({"round": round_num, "result": opus_result})
            accumulated_context = opus_result
            print(f"  [B] フォールバック完了")
        except Exception as e2:
            opus_result = f"エラー: {e2}"
            all_opus_reviews.append({"round": round_num, "result": opus_result})
            accumulated_context = opus_result
            print(f"  [B] フォールバックも失敗: {e2}")

    # Save Opus review
    with open(os.path.join(OUTPUT_DIR, f"round_{round_num:02d}_B_Opus_{safe_focus}.md"), "w") as f:
        f.write(opus_result)

    time.sleep(2)
    print(f"  Round {round_num}/12 完了")

# ========================================
# Generate Final Consolidated Report
# ========================================
print(f"\n{'='*70}")
print("最終統合レポート生成中...")
print(f"{'='*70}")

now = datetime.now()
date_str = now.strftime("%Y-%m-%d")

final_report = f"""# TAISUN CodeGraph — 最終GPT報告レポート（往復12回）

> 実行日: {now.strftime("%Y年%m月%d日 %H:%M")}
> 方式: GPT-5.4（厳しめレビュー）↔ Opus 4.6（俯瞰レビュー+指示作成）× 12往復
> 総ラウンド数: {len(all_gpt_reviews)} GPTレビュー + {len(all_opus_reviews)} Opusレビュー

---

## レビュープロセス

```
Round N:
  [A] GPT-5.4 → 厳しいレビュー（問題点5個以上、深刻度付き）
  [B] Opus 4.6 → 俯瞰レビュー + 次回GPTへの指示作成
  → 次のRoundへ（GPTはOpusの指示を受けてさらに深掘り）
```

## ラウンド別テーマ

| Round | テーマ |
|-------|--------|
"""

for i, focus in enumerate(ROUND_FOCUS, 1):
    final_report += f"| {i} | {focus} |\n"

final_report += "\n---\n\n"

# Add all round results
for i in range(len(all_gpt_reviews)):
    r = i + 1
    final_report += f"## Round {r}/12\n\n"
    final_report += f"### [A] GPT-5.4 レビュー\n\n{all_gpt_reviews[i]['result']}\n\n"
    if i < len(all_opus_reviews):
        final_report += f"### [B] Opus 4.6 俯瞰レビュー\n\n{all_opus_reviews[i]['result']}\n\n"
    final_report += "---\n\n"

# Extract scores
import re
gpt_scores = []
for r in all_gpt_reviews:
    matches = re.findall(r'スコア[：:]*\s*(\d+)', r['result'])
    if matches:
        gpt_scores.append(int(matches[0]))

final_report += f"""
## 統計サマリー

| 指標 | 値 |
|------|-----|
| 往復回数 | {TOTAL_ROUNDS} |
| GPTレビュー数 | {len(all_gpt_reviews)} |
| Opusレビュー数 | {len(all_opus_reviews)} |
| GPT平均スコア | {sum(gpt_scores)/len(gpt_scores):.1f}/100 |
| GPT最高スコア | {max(gpt_scores)}/100 |
| GPT最低スコア | {min(gpt_scores)}/100 |

---

> このレポートは GPT-5.4 と Claude Opus 4.6 の12回往復レビューにより生成されました。
> 各ラウンドの個別ファイルは ~/Desktop/最終GPT報告レポート/ に保存されています。
""" if gpt_scores else ""

# Save final report
title = f"TAISUN_CodeGraph_最終GPT報告レポート_{date_str}"
final_path = os.path.join(OUTPUT_DIR, f"{title}.md")
with open(final_path, "w") as f:
    f.write(final_report)

print(f"\n最終レポート保存: {final_path}")
if gpt_scores:
    print(f"GPTスコア: 平均 {sum(gpt_scores)/len(gpt_scores):.1f}/100 (最低{min(gpt_scores)} / 最高{max(gpt_scores)})")
print("完了!")
