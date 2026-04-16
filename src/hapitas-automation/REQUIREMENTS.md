# ハピタス自動配信 要件定義書

## 目的
毎朝7時にハピタスの高還元案件を自動取得し、LINE用・メルマガ用の文章をサーバーに保存する。

## 機能要件
1. ハピタスにログインして高還元案件（ポイント降順）を取得する
2. Claude AIで2種類の文章を自動生成する
   - LINE投稿用（300文字以内）
   - メルマガ用（件名＋本文）
3. 生成した文章をサーバーのファイルに日付付きで保存する
4. 毎朝7時（JST）に自動実行する

## 非機能要件
- セットアップはコマンド1〜2回で完了すること
- 障害時はフォールバック文章を保存する（スクリプトが落ちない）
- ログを残す

## 利用環境
- サーバー: ConoHa VPS（Ubuntu 24.04）IP: 133.88.121.74
- 言語: Python 3.12
- ブラウザ自動化: 不使用（requests + BeautifulSoupで完結）

---

# SDD（技術設計書）

## アーキテクチャ

```
cron（毎朝7時）
  └→ run.py
       ├── [1] スクレイピング（requests + BeautifulSoup）
       │    └── ハピタスにログイン → 高還元案件ページを取得
       ├── [2] 文章生成（Anthropic API）
       │    └── 案件情報をプロンプトに入れてLINE文・メルマガ文を生成
       └── [3] ファイル保存
            ├── /opt/hapitas-output/line_YYYY-MM-DD.txt
            └── /opt/hapitas-output/mail_YYYY-MM-DD.txt
```

## 依存ライブラリ（最小限）
```
requests       # HTTP通信
beautifulsoup4 # HTML解析
anthropic      # Claude API
python-dotenv  # .env読み込み
```

## セットアップ手順（最短）
```bash
# 1. ライブラリインストール（1回だけ）
pip3 install requests beautifulsoup4 anthropic python-dotenv --break-system-packages

# 2. .envにAPIキーを追加
echo "ANTHROPIC_API_KEY=sk-ant-xxxx" >> /opt/008_point/.env

# 3. テスト実行
python3 /opt/008_point/src/hapitas-automation/run.py

# 4. cron設定（1回だけ）
(crontab -l; echo "0 22 * * * python3 /opt/008_point/src/hapitas-automation/run.py >> /opt/hapitas.log 2>&1") | crontab -
```

## .env設定項目
```
HAPITAS_EMAIL=eve.plusone@gmail.com
HAPITAS_PASSWORD=ibuki7130
ANTHROPIC_API_KEY=sk-ant-xxxx（Claude Consoleから取得）
```

## 出力ファイル
| ファイル | 内容 |
|---------|------|
| line_2026-04-16.txt | LINE投稿文 |
| mail_2026-04-16.txt | 件名＋メルマガ本文 |
