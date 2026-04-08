# AI漫画生成スキル

AIを活用した漫画制作を支援するスキルです。

## 使用方法

```
/ai-manga-generator [オプション]
```

## オプション

- `--style [スタイル]`: 漫画スタイル（shonen/shojo/seinen/webtoon/yonkoma）
- `--tool [ツール]`: 使用ツール（nanobanana/comfyui/chatgpt/komiko）
- `--prompt [プロンプト]`: 生成したいシーンの説明
- `--character [説明]`: キャラクター設定
- `--workflow`: ワークフロー選択ガイドを表示

## 実行フロー

### Step 1: ヒアリング

まず、以下を確認します：

1. **目的**: SNS投稿 / 連載 / 同人誌 / 商用
2. **スタイル**: 少年漫画 / 少女漫画 / 青年漫画 / Webtoon / 4コマ
3. **ページ数**: 1ページ / 4コマ / 複数ページ
4. **キャラクター**: 新規作成 / 既存キャラ使用
5. **技術レベル**: 初心者 / 中級者 / 上級者

### Step 2: ツール選定

| レベル | 推奨ツール | 所要時間 |
|--------|-----------|----------|
| 初心者 | Canva / ChatGPT + GPT-4o | 5-15分 |
| 中級者 | Nano Banana Pro + Canva | 20-40分 |
| 上級者 | ComfyUI + LoRA + PanelForge | 1-3時間 |

### Step 3: プロンプト生成

スタイルに応じた最適なプロンプトを生成します。

#### 少年漫画テンプレート
```
A dynamic shonen manga panel, black and white ink style with screentones,
[キャラクター説明] in an action pose, [アクション説明],
speed lines radiating from center, dramatic shadows,
G-pen linework, high contrast, --ar 2:3
```

#### 少女漫画テンプレート
```
A romantic shojo manga panel, delicate thin linework,
[キャラ1] and [キャラ2] in [シーン],
sparkling background effects, flower decorations in corners,
soft screentone gradients, dreamy atmosphere, --ar 2:3
```

#### Webtoonテンプレート
```
A webtoon-style vertical panel, full color digital art,
[キャラクター] with [説明] in [設定],
modern clean linework, vibrant colors, subtle gradients,
dramatic lighting, --ar 9:16
```

### Step 4: 画像生成実行

選択したツールで画像を生成します。

### Step 5: 仕上げガイド

- 吹き出し・セリフの追加方法
- 効果線・トーンの適用
- コマ配置の調整
- 最終出力形式の選択

## キャラクター一貫性の維持

### 方法1: 参照画像（推奨）
```
1. キャラクター設定画（正面・横・背面）を用意
2. 各生成時に参照画像としてアップロード
3. AIが視覚特性を記憶して再現
```

### 方法2: 固定プロンプト
```
キャラクター説明を毎回同じ文言で記述:
- "brown trench coat" を "coat" に変えない
- "cybernetic eye on the left side" と具体的に
- 髪型・目の色・服装を詳細に固定
```

### 方法3: LoRAトレーニング（上級）
```
1. 15-30枚のキャラクター画像を収集
2. 様々なアングル・表情・衣装を含める
3. ComfyUIでLoRAトレーニング実行
4. 固有のトリガーワードを設定
```

## バズる漫画のコツ

1. **ギャップを作る**: 予想外の展開
2. **初動30分**: 投稿直後のエンゲージメントが重要
3. **ラブコメ・ホラー**: X(Twitter)と相性が良い
4. **AI+人間コラボ**: 透明性を保つ

## 関連スキル

- `/nanobanana-pro`: Nano Banana Pro画像生成
- `/nanobanana-prompts`: プロンプト最適化
- `/manga-production`: 従来の漫画制作スキル
- `/youtube-thumbnail`: サムネイル作成

## 参考リソース

- [AI漫画生成マスターガイド](./README.md)
- [Nano Banana Pro公式](https://gemini.google/jp/overview/image-generation/)
- [ComfyUI漫画ワークフロー](https://openart.ai/workflows/)
