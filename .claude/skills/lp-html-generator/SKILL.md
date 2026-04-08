---
name: lp-html-generator
description: HTML/CSSでLP画像を生成。Playwrightでスクリーンショットして画像化。日本語テキストが100%正確に表示される。
version: "1.0.0"
author: TAISUN
category: marketing
tags: [lp, html, css, playwright, screenshot, image-generation]
dependencies: [playwright-skill]
---

# LP HTML Generator

HTML/CSSでLPを構築し、Playwrightでスクリーンショットして画像化するスキル。
AIによる画像生成と異なり、テキストが絶対に崩れない。日本語フォントも完全対応。

---

## コマンド一覧

| コマンド | 説明 |
|----------|------|
| `/lp-html-generate` | テンプレート + テキストでLP画像生成 |
| `/lp-html-register` | 参考画像からHTMLテンプレートを作成・保存 |
| `/lp-html-list` | 保存済みテンプレートの一覧表示 |

---

## 使い方

### テンプレートからLP画像生成

「modernスタイルでセミナーLP画像を作って」

手順:
1. `.claude/skills/lp-html-generator/templates/[テンプレート名].html` を読み込む（Read tool）
2. ユーザー指定のテキストでプレースホルダーを差し替え:
   - `{{topBarText}}` → トップバーテキスト
   - `{{headline}}` → メインヘッドライン
   - `{{subtitle}}` → サブタイトル
   - `{{ctaText}}` → CTAテキスト
   - `{{bottomBarText}}` → ボトムバーテキスト
   - `{{primaryColor}}` → メインカラー（指定あれば）
   - `{{textColor}}` → テキストカラー（指定あれば）
   - `{{ctaColor}}` → CTAボタンカラー（指定あれば）
3. 完成したHTMLを `/tmp/lp_output_[timestamp].html` に保存（Write tool）
4. 下記「画像化手順」に従いPlaywrightでスクリーンショット
5. デスクトップに `~/Desktop/lp_[timestamp].png` として保存
6. 生成完了を報告（ファイルパス付き）

### 参考画像からテンプレート作成

「このLP画像からHTMLテンプレートを作って」+ 画像パス

手順:
1. 指定画像をAI分析
2. デザインを再現するHTML/CSSを生成（下記HTMLテンプレート構造に準拠）
3. プレースホルダー（`{{headline}}`等）を適切な箇所に配置
4. `.claude/skills/lp-html-generator/templates/[名前].html` に保存（Write tool）
5. 保存完了を報告

### テンプレート一覧

「HTMLテンプレート一覧」

手順:
1. `.claude/skills/lp-html-generator/templates/` を確認（Glob tool）
2. `.html` ファイルの一覧を表示（.gitkeep除外）

---

## 画像化手順（Playwright MCP使用）

```
1. HTMLファイルを /tmp/lp_output_[timestamp].html に保存（Write tool）

2. mcp__playwright__browser_navigate で file:// URLを開く
   url: "file:///tmp/lp_output_[timestamp].html"

3. mcp__playwright__browser_resize で 1080x1080 にリサイズ
   width: 1080
   height: 1080

4. mcp__playwright__browser_take_screenshot でPNG保存
   raw: false（base64エンコード）

5. 保存先: ~/Desktop/lp_[timestamp].png

6. mcp__playwright__browser_close でブラウザ終了
```

### Playwright MCPが利用できない場合のフォールバック

1. HTMLファイルを `/tmp/lp_output_[timestamp].html` に保存
2. ユーザーにブラウザで開くよう案内:
   ```
   HTMLファイルを保存しました: /tmp/lp_output_[timestamp].html
   ブラウザで開いてスクリーンショットを撮ってください。
   推奨サイズ: 1080x1080px
   ```

---

## HTMLテンプレート構造

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px;
    font-family: 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif;
    background: {{backgroundColor}};
    overflow: hidden;
  }
  .top-bar {
    background: {{primaryColor}};
    color: white;
    padding: 12px;
    text-align: center;
    font-size: 16px;
    font-weight: bold;
  }
  .hero {
    padding: 40px;
    text-align: center;
  }
  .hero h1 {
    font-size: 48px;
    color: {{textColor}};
    line-height: 1.4;
    margin-bottom: 20px;
    font-weight: bold;
  }
  .hero .subtitle {
    font-size: 24px;
    color: {{secondaryColor}};
    margin-bottom: 30px;
    line-height: 1.6;
  }
  .cta-button {
    display: inline-block;
    background: {{ctaColor}};
    color: white;
    padding: 18px 48px;
    border-radius: 8px;
    font-size: 22px;
    font-weight: bold;
    text-decoration: none;
    cursor: pointer;
  }
  .bottom-bar {
    background: {{primaryColor}};
    color: white;
    padding: 12px;
    text-align: center;
    font-size: 14px;
  }
</style>
</head>
<body>
  <div class="top-bar">{{topBarText}}</div>
  <div class="hero">
    <h1>{{headline}}</h1>
    <p class="subtitle">{{subtitle}}</p>
    <a class="cta-button">{{ctaText}}</a>
  </div>
  <div class="bottom-bar">{{bottomBarText}}</div>
</body>
</html>
```

### プレースホルダー一覧

| プレースホルダー | 説明 | デフォルト値 |
|----------------|------|------------|
| `{{topBarText}}` | トップバーのテキスト | 無料セミナー開催 |
| `{{headline}}` | メインヘッドライン | ヘッドラインをここに |
| `{{subtitle}}` | サブタイトル・サブコピー | サブコピーをここに |
| `{{ctaText}}` | CTAボタンのテキスト | 今すぐ申し込む |
| `{{bottomBarText}}` | ボトムバーのテキスト | お問い合わせはこちら |
| `{{backgroundColor}}` | 背景色 | #FFFFFF |
| `{{primaryColor}}` | メインカラー | #C92A2A |
| `{{secondaryColor}}` | サブカラー | #1A4D80 |
| `{{textColor}}` | テキスト色 | #333333 |
| `{{ctaColor}}` | CTAボタン色 | #27AE60 |

---

## プリセットテンプレート

`.claude/skills/lp-html-generator/templates/` に5種類を用意:

| ファイル名 | スタイル | 特徴 |
|-----------|---------|------|
| `modern.html` | モダン/ミニマル | 白背景・黒テキスト・青アクセント |
| `premium.html` | 高級感 | ダーク背景・金アクセント |
| `pop.html` | ポップ | カラフル・丸みデザイン |
| `corporate.html` | ビジネス | 紺背景・白テキスト・信頼感 |
| `seminar.html` | セミナー告知 | 赤アクセント・緊急感 |

全テンプレートは1080x1080の正方形。

---

## エラーハンドリング

- テンプレートが見つからない場合: `/lp-html-list` で一覧確認を促す
- Playwright MCPが利用できない場合: HTMLファイルを保存してブラウザ手動撮影を案内
- 日本語フォントが表示されない場合: font-familyに `'Noto Sans JP'` を追加
