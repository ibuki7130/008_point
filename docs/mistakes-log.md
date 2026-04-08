# mistakes-log.md — 教訓・知見ログ

非自明な問題と解決策を記録します。次のClaudeセッションで同じミスを繰り返さないために。

---

## [2026-02-22] [bug] argparse nargs="+" でoptionalフラグ単独実行ができない

**問題**: `--check` フラグ単独で `python scripts/ocr_collector.py --check` を実行するとargparseエラー
**原因**: positional引数 `inputs` が `nargs="+"` （1つ以上必須）のため、ファイル指定なしでは起動できない
**解決策**: `nargs="+"` → `nargs="*"` （0個以上許容）に変更。`--check`単独時は `inputs=[]` として処理
**予防法**: オプショナルなフラグ（`--check`, `--version`など）と組み合わせるpositional引数は常に `nargs="*"` を使う

---

## [2026-02-22] [workflow] story-patternスキルが台本を自動保存しない

**問題**: `/story-pattern-inner-conflict` で台本を生成したが、ファイルとして保存されず会話上に出力のみ
**原因**: スキル定義に保存処理が含まれておらず、出力は会話テキストのみ
**解決策**: ユーザーから「どこに保存してますか」と指摘を受けて初めて `generated_scripts/` に保存した
**予防法**: story-patternスキル実行後は必ず `generated_scripts/YYYYMMDD_HHMMSS/` に自動保存する。スキル定義に保存ステップを追加すること

---

## [2026-02-22] [pattern] A型テンプレートが60点止まりの根本原因3点

**問題**: A型テンプレートで生成した台本がプロ評価で60点。感情移入ができない
**原因**:
1. 善行シーンの内面描写が6行のみ（迷いゼロ・即座に全財産を渡す）→ 主人公が聖人化
2. 解決が「全額一括」（家賃36万・奨学金15万/月など非現実的な数字）→ ご都合主義
3. 恩送りシーンが12行のみ → 最大感動ポイントが最も薄い
**解決策**: 5パターンスキル（inner-conflict / systemic-wall / delayed-rescue / flawed-hero / witness-reversal）を作成
**予防法**: 台本生成前にリアリティチェックリストを確認。善行シーンの迷い描写は最低3行、恩送りは400字以上を必須とする
