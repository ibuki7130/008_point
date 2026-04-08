# TAISUN Agent インストールガイド

> **対応OS**: macOS (Air / Pro) | Windows 10/11

---

## 必要なもの（共通）

| 要件 | バージョン | 入手先 |
|------|-----------|--------|
| Node.js | 18 以上 | https://nodejs.org/ |
| Git | 2.x 以上 | https://git-scm.com/ |
| Claude Code | 最新 | https://claude.ai/download |
| Python | 3.x 以上（推奨） | https://www.python.org/ |

---

## Mac（Air / Pro）

### クイックインストール

```bash
# 1. リポジトリをクローン
git clone https://github.com/taiyousan15/taisun_agent.git
cd taisun_agent

# 2. インストール実行（全自動）
bash scripts/install.sh
```

### .env を設定

```bash
# .env をテキストエディタで開く
open -a TextEdit .env

# ANTHROPIC_API_KEY を設定（必須）
ANTHROPIC_API_KEY=sk-ant-...

# intelligence-research スキル用（任意）
FRED_API_KEY=your_key
NEWSAPI_KEY=your_key
APIFY_TOKEN=your_key
```

### アップデート

```bash
git pull origin main
bash scripts/install.sh
```

### メモリ最適化（推奨）

```bash
# Node.js ヒープサイズ増加（長時間セッション向け）
echo 'export NODE_OPTIONS="--max-old-space-size=8192"' >> ~/.zshrc
source ~/.zshrc
```

### トラブルシューティング（Mac）

| エラー | 対処 |
|--------|------|
| `command not found: node` | https://nodejs.org/ からインストール |
| `permission denied` | `chmod +x scripts/install.sh` を実行 |
| `node: bad option` | Node.js 18 以上にアップグレード |
| ビルドエラー | `rm -rf node_modules dist && npm install` |

---

## Windows 10/11

### 事前準備

PowerShell でスクリプトの実行を許可する（初回のみ）:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### クイックインストール

**PowerShell を開いて実行:**

```powershell
# 1. リポジトリをクローン
git clone https://github.com/taiyousan15/taisun_agent.git
cd taisun_agent

# 2. インストール実行（全自動）
.\scripts\install.ps1
```

### .env を設定

```powershell
# メモ帳で .env を開く
notepad .env
```

`.env` に以下を設定:

```
# 必須
ANTHROPIC_API_KEY=sk-ant-...

# intelligence-research スキル用（任意）
FRED_API_KEY=your_key
NEWSAPI_KEY=your_key
APIFY_TOKEN=your_key
```

### アップデート

```powershell
git pull origin main
.\scripts\install.ps1
```

### Windows の注意点

| 項目 | Mac | Windows |
|------|-----|---------|
| スキル | シンボリックリンク（git pull で自動更新） | Junction（git pull で自動更新） |
| エージェント | シンボリックリンク（自動更新） | コピー（再インストールで更新） |
| chmod | 必要 | 不要 |

> **エージェントの更新について**: Windows では `git pull` 後に `.\scripts\install.ps1` を再実行することでエージェントが最新化されます。

### トラブルシューティング（Windows）

| エラー | 対処 |
|--------|------|
| `スクリプトの実行が無効` | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` を実行 |
| `node が見つからない` | https://nodejs.org/ からインストール後、PowerShell を再起動 |
| `git が見つからない` | https://git-scm.com/ からインストール |
| Junction 作成失敗 | PowerShell を管理者として実行 |

---

## インストール後の確認（共通）

Claude Code でこのディレクトリを開き、以下を試してください:

```
/intelligence-research   → AIニュース・経済指標収集
/research "テーマ"       → ディープリサーチ
/batch                   → 並列エージェント実行
```

---

## 環境変数一覧

| 変数名 | 必須 | 用途 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | **必須** | Claude API（全機能の基本） |
| `FRED_API_KEY` | 推奨 | 経済指標（FRED 無料登録）|
| `NEWSAPI_KEY` | 推奨 | ニュース収集（newsapi.org 無料枠）|
| `APIFY_TOKEN` | 任意 | X/Twitter 収集 |
| `TAVILY_API_KEY` | 任意 | Web 検索 MCP |
| `OPENAI_API_KEY` | 任意 | gpt-researcher MCP |
| `GITHUB_TOKEN` | 任意 | GitHub MCP |

---

## サポート

- Issues: https://github.com/taiyousan15/taisun_agent/issues
