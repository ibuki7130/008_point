---
name: shorts-create
description: Auto-generate Shorts/Reels videos (3 styles supported)
version: "2.0.0"
author: TAISUN
triggers:
  - "shorts"
  - "ショート動画"
  - "Instagram Shorts"
  - "YouTube Shorts"
  - "リール"
  - "縦動画"
  - "マーケ博士風"
  - "図解動画"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# /shorts-create - Instagram Shorts 完全自動生成パイプライン

トピックまたはURLを渡すだけで、リサーチからレンダリングまで全自動実行し、Instagram/YouTube Shorts動画を完成させる。

---

## スタイル一覧（v2.0）

| スタイル | 説明 | 使用ツール | 例 |
|---------|------|-----------|-----|
| **marke** | マーケ博士風（ベージュ背景+図解+マスコット） | HTML+Playwright+VOICEVOX+ffmpeg | `/shorts-create "SNS副業3ステップ" --style marke` |
| **ranking** | ランキング形式（サンバーストBG+テロップ） | short-video-factory Remotion | `/shorts-create "やばい習慣ランキング" --style ranking` |
| **2ch** | 2ch風ストーリー | short-video-factory Remotion | `/shorts-create "コンビニバイトの修羅場" --style 2ch` |
| **comic** | コミック風（NanoBanana Pro画像+テロップ） | NanoBanana+Remotion | `/shorts-create "選択的盲目" --style comic` |

---

## Style: marke（マーケ博士風 図解動画）

### 概要
ベージュ背景 + 番号バッジ + Before/After図解 + マスコットキャラで構成される教育系ショート動画。Instagram Reelで人気の「マーケ博士」スタイルを再現。

### 使い方
```
/shorts-create "OpenClaw AI活用3ステップ" --style marke
/shorts-create "SNS副業で月10万稼ぐ方法" --style marke
```

### パイプライン
```
テーマ入力
  ↓
Phase 1: 台本生成（3ステップ構成のテキスト + 図解要素）
Phase 2: HTMLスライド生成（イントロ + 01 + 02 + 03 + アウトロ = 5枚）
Phase 3: Playwrightスクリーンショット（1080x1920 PNG × 5枚）
Phase 4: VOICEVOX音声合成（5音声）
Phase 5: ffmpeg動画組立（スライド+音声→個別MP4→結合→BGM合成）
  ↓
出力: 完成MP4（1080x1920, 55-70秒）
```

### デザイン定数

| 要素 | 値 |
|------|-----|
| 背景色 | `#E8DED0`（ベージュ） |
| メイン文字色 | `#1B2270`（紺） |
| 強調色 | `#E91E8C`（ピンク） |
| 番号バッジ | 白丸(130px) + ピンク数字(72px italic) + 紺ラベル(44px) |
| ボックス枠 | 紺 `#1B2270` 3px solid, border-radius: 16px |
| Before枠 | グレー `#999` 3px solid + ピンク✕オーバーレイ |
| ラベル「これまで」 | 紺背景 白文字 |
| ラベル「改善後」 | ピンク背景 白文字 |
| アイコン | 80px丸 + 22pxテキスト |
| 強調テキスト | 44-46px 900weight |
| ポイントボックス | 白背景 + 紺枠 + 💡アイコン + 28-30pxテキスト |
| マスコット | 250px丸アイコン + 吹き出し（画面下部固定） |
| フォント | Noto Sans JP 700/900 |

### 素材パス

| 素材 | パス |
|------|------|
| マスコット画像 | `short-video-factory/local-files/mascot.jpg` |
| BGM | `short-video-factory/assets/bgm/ukiuki_lalala.mp3` |
| スライドHTML | `short-video-factory/local-files/slides-{project}/` |
| スライドPNG | `short-video-factory/local-files/slides-{project}/output/` |
| 完成動画 | `short-video-factory/generated/` |

### HTMLテンプレート構造

各スライドHTMLの共通CSS:
```css
body { width: 1080px; height: 1920px; background: #E8DED0; font-family: 'Noto Sans JP', sans-serif; }
.badge { position: absolute; top: 60px; /* 白丸+ピンク数字+紺ラベル */ }
.area { position: absolute; top: 240px; left: 50px; right: 50px; /* 図解エリア */ }
.mascot { position: absolute; bottom: 20px; /* マスコット固定 */ }
```

### VOICEVOX設定

| 項目 | 値 |
|------|-----|
| URL | `http://localhost:50021` |
| Speaker | 3（ずんだもん） |
| API | `/audio_query` → `/synthesis` |

### ffmpeg動画組立コマンド

```bash
# 1. 各スライド → 個別MP4（音声長+1秒）
ffmpeg -y -loop 1 -i slide.png -i audio.wav \
  -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p \
  -t {duration} -vf "scale=1080:1920" vid.mp4

# 2. 結合
ffmpeg -y -f concat -safe 0 -i concat.txt -c copy combined.mp4

# 3. BGM合成
ffmpeg -y -i combined.mp4 -i bgm.mp3 \
  -filter_complex "[0:a]volume=3.0[voice];[1:a]volume=0.12,afade=t=in:st=0:d=1,afade=t=out:st={fade}:d=2[bgm];[voice][bgm]amix=inputs=2:duration=first[out]" \
  -map 0:v -map "[out]" -c:v copy -c:a aac -b:a 192k output.mp4
```

### コスト

| 項目 | コスト |
|------|--------|
| HTML生成 | $0（セッション内） |
| Playwright | $0（ローカル） |
| VOICEVOX | $0（ローカル） |
| ffmpeg | $0（ローカル） |
| **合計** | **$0**（セッション料金のみ） |

---

## Style: ranking / 2ch（short-video-factory連携）

### プロジェクトパス
```
/Users/matsumototoshihiko/Desktop/dev/ショート動画システム4月1日/short-video-factory
```

### 使い方
```
/shorts-create "やばい習慣ランキング" --style ranking
/shorts-create "コンビニバイトの修羅場" --style 2ch
```

### パイプライン
```
テーマ入力
  ↓
Phase 1: 台本JSON生成（fixtures/sample-script.json）
Phase 2: pnpm render:v3（VOICEVOX + いらすとや + Remotion + ffmpeg）
  ↓
出力: generated/latest/output.mp4（約59秒）
```

### 台本スキーマ（ランキング）
- `videoTitle`: max 40文字（\nで改行、7文字×3行推奨）
- `intro`: max 40文字
- `items`: 3-10個（rank降順）
  - `topic`: max 24文字（**8文字以下で1行強制**）
  - `comment1`: max 50文字（青枠・共感系）
  - `comment2`: max 50文字（赤枠・ツッコミ系）
  - `body`: max 100文字（読み上げ専用）
  - `imageKeywords`: 2要素以上の配列
  - `imageKeywordsEn`: 英語キーワード
- `outro`: max 30文字

### コスト
- 全てローカル処理: **$0**

---

---

## 使い方

```
/shorts-create <トピックまたはURL> [オプション]
```

### 例

```bash
# 新規作成モード（トピックから）
/shorts-create 選択的盲目
/shorts-create "ダニングクルーガー効果" --style comic
/shorts-create "行動経済学のナッジ理論" --duration 90

# リライトモード（既存動画URLから）
/shorts-create https://www.instagram.com/reel/DLvuCSMPLSW/
/shorts-create https://youtube.com/shorts/xxxxx --rewrite

# 再開モード（中断時）
/shorts-create --resume <project_name>
```

---

## 2つの制作モード

### Mode A: 新規作成（トピックベース）

```
入力: トピック名（日本語）
  ↓
Phase 1: リサーチ（world-research / research-free）
Phase 2: スクリプト生成（Claude）
Phase 3a: 画像生成（NanoBanana Pro / Pexels）
Phase 3b: 音声生成（Fish Audio Timo）
Phase 4: Remotion コンポジション（TSX生成）
Phase 5: レンダリング（Remotion CLI）
Phase 6: 品質検証（ffprobe + チェックリスト）
  ↓
出力: 完成動画 MP4（1080x1920, 30fps）
```

### Mode B: リライト（URL ベース）

```
入力: Instagram Reel / YouTube Shorts URL
  ↓
Phase 0: ダウンロード + フレーム抽出（yt-dlp + ffmpeg）
Phase 1: 動画分析 + リサーチ（agentic-vision + world-research）
Phase 2: リライトスクリプト生成（Claude）
Phase 3a: 画像生成（NanoBanana Pro / Pexels）
Phase 3b: 音声生成（Fish Audio Timo）
Phase 4: Remotion コンポジション（TSX生成）
Phase 5: レンダリング（Remotion CLI）
Phase 6: 品質検証（ffprobe + チェックリスト）
  ↓
出力: 完成動画 MP4（1080x1920, 30fps）
```

---

## 7フェーズ詳細

### Phase 1: リサーチ

**目的**: トピックに関する深い知識を収集し、スクリプトの根拠とする。

**ツール**: `research-free` スキル（APIキー不要）または `world-research` スキル

**手順**:
1. トピックのキーワードで WebSearch を3回実行
2. 上位結果から WebFetch で詳細取得（最大3ページ）
3. 心理学・マーケティング観点での知見を整理
4. `research.json` に保存

**出力**:
```json
{
  "topic": "選択的盲目",
  "summary": "認知バイアスの一種で...",
  "key_points": ["ポイント1", "ポイント2", ...],
  "examples": ["具体例1", "具体例2", ...],
  "sources": [{"title": "...", "url": "..."}]
}
```

**スキップ条件**: `--skip-research` オプション指定時

---

### Phase 2: スクリプト生成

**目的**: リサーチ結果をもとに、動画のシーン構成・ナレーション・テロップを生成。

**構成テンプレート**: フック → 問題提起 → 概念説明 → 具体例1 → 具体例2 → CTA

**手順**:
1. リサーチ結果をコンテキストとして入力
2. 6-8シーンのスクリプトをJSON形式で生成
3. 各シーンに以下を含む:
   - `narration`: ナレーション文（日本語、自然な語り口）
   - `image_prompt`: 画像生成プロンプト（英語、"no text, no letters" 必須）
   - `telop`: テロップ定義（色・サイズ・エフェクト指定）
   - `transition`: トランジション種類
   - `effect`: テキストエフェクト種類
4. `script.json` に保存

**スクリプトJSON形式**:
```json
{
  "title": "動画タイトル",
  "total_duration_sec": 60,
  "scenes": [
    {
      "id": 1,
      "role": "hook",
      "duration_sec": 8,
      "narration": "ナレーション文...",
      "image_prompt": "playing cards magic trick, dramatic lighting, 4K quality, cinematic, no text, no letters",
      "image_source": "nanobanana",
      "telop": {
        "lines": [
          [{"text": "あなたの選んだ", "color": "white", "fontSize": 64}],
          [{"text": "カードを消します", "color": "yellow", "fontSize": 88}]
        ],
        "effect": "popup",
        "position": "center"
      },
      "transition": "zoomIn",
      "sound_effect": null
    }
  ]
}
```

**テロップカラーパレット**:
| 色名 | HEX | 用途 |
|------|-----|------|
| white | #FFFFFF | 通常テキスト |
| yellow | #CCFF00 | 強調・数字 |
| red | #FF0000 | 危険・警告・キーワード |

**テキストエフェクト**:
| エフェクト | 説明 |
|-----------|------|
| popup | ポップイン + 微振動 |
| wipeUp | 下から上にスライド |
| shake | 左右に激しく揺れ |
| slideLeft | 右から左にスライド |
| slideRight | 左から右にスライド |

**トランジション**:
| トランジション | 説明 |
|---------------|------|
| zoomIn | 徐々にズームイン |
| zoomOut | ズームアウト |
| panLeft | 左にパン |
| panRight | 右にパン |
| panDown | 下にパン |

---

### Phase 3a: 画像生成

**目的**: 各シーンのビジュアルを生成。

**ツール優先順位**:
1. **NanoBanana Pro**（コミック風イラスト） - `nanobanana-pro` スキル使用
2. **Pexels MCP**（実写動画素材） - `mcp__pexels__searchPhotos` / `mcp__pexels__searchVideos`
3. **Pixabay MCP**（補助画像） - `mcp__pixabay__search_pixabay_images`

**NanoBanana Pro 実行手順**:
1. Playwright MCPで `https://aistudio.google.com/` にアクセス
2. Gemini 2.0 Flash (NanoBanana) を選択
3. 各シーンの `image_prompt` を入力して画像生成
4. 生成画像をダウンロード → `images/scene_XX.png`

**Pexels 動画素材の場合**:
```
mcp__pexels__searchVideos: query="playing cards magic", orientation="portrait"
mcp__pexels__downloadVideo: id=<video_id>, quality="hd"
```

**画像要件**:
- 最小サイズ: 1080x1920（縦型）またはアスペクト比 9:16
- フォーマット: PNG / JPG
- ファイルサイズ: 100KB 以上

**出力先**: `output/<project>/images/scene_XX.png`

---

### Phase 3b: 音声生成（Fish Audio TTS）

**目的**: ナレーション音声を高品質に生成。

**ツール**: Fish Audio API（Timo Voice）

**設定**:
```
Voice ID: d4c86c697b3e4fc090cf056f17530b2a (Timo - 日本語男性)
API Key: .env の FISH_AUDIO_API_KEY を使用
Format: MP3
```

**API呼び出し**:
```bash
curl -X POST "https://api.fish.audio/v1/tts" \
  -H "Authorization: Bearer ${FISH_AUDIO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "ナレーション文",
    "reference_id": "d4c86c697b3e4fc090cf056f17530b2a",
    "format": "mp3"
  }' \
  --output "audio/scene_01.mp3"
```

**音声長さ計測**:
```bash
ffprobe -v quiet -show_entries format=duration -of csv=p=0 audio/scene_01.mp3
```

**注意**:
- macOS `say` コマンドは**使用禁止**（品質不足）
- 各シーンの音声長さを正確に計測し、Phase 4 のタイミング計算に使用

**出力先**: `output/<project>/audio/scene_XX.mp3`

---

### Phase 4: Remotion コンポジション（TSX生成）

**目的**: 画像・音声・テロップを統合する Remotion コンポーネントを生成。

**ベースプロジェクト**: `instagram-shorts-skill/remotion/`

**手順**:
1. 音声ファイルの長さを `ffprobe` で計測
2. シーンごとの `startSec` / `endSec` を計算
3. `SelectiveBlindnessVideo.tsx` をベーステンプレートとして使用
4. 新しいコンポジション TSX を生成:
   - `ImageSlide` コンポーネント（5種トランジション）
   - `EffectWrapper` コンポーネント（5種テキストエフェクト）
   - `SizedMixedTelop` コンポーネント（サイズ・色付きテロップ）
   - `Audio` シーケンス
5. `remotion/src/Root.tsx` にコンポジションを登録

**TSXテンプレート構造**:
```tsx
// 自動生成されるコンポジション
export const <ProjectName>Video: React.FC<Props> = ({ audioDir, imagesDir }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Image sequences with transitions */}
      {scenes.map((scene, i) => (
        <Sequence key={`img-${i}`} from={startFrame} durationInFrames={duration}>
          <ImageSlide imagePath={...} transition={scene.transition} />
        </Sequence>
      ))}

      {/* Telop sequences with effects */}
      {scenes.map((scene, i) => (
        <Sequence key={`telop-${i}`} from={startFrame} durationInFrames={duration}>
          <EffectWrapper effect={scene.effect}>
            <SizedMixedTelop lines={scene.telop.lines} />
          </EffectWrapper>
        </Sequence>
      ))}

      {/* Audio sequences */}
      {scenes.map((scene, i) => (
        <Sequence key={`audio-${i}`} from={startFrame}>
          <Audio src={staticFile(`${audioDir}/${scene.audioFile}`)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
```

**共通コンポーネント（既存）**:
- `UrbanLegendTelop.tsx` - テロップスタイル定義
- `ImageSlide` - 5種トランジション
- `EffectWrapper` - 5種テキストエフェクト
- `SizedMixedTelop` - サイズ・色付きテロップ

**静的ファイル配置**:
```bash
# 画像を Remotion の public/ にコピー
cp output/<project>/images/* remotion/public/images/<project>/

# 音声を Remotion の public/ にコピー
cp output/<project>/audio/* remotion/public/audio/<project>/
```

---

### Phase 5: レンダリング

**目的**: Remotion CLI でMP4を出力。

**コマンド**:
```bash
cd instagram-shorts-skill/remotion

npx remotion render src/index.ts <CompositionId> \
  ../output/<project>/video.mp4
```

**レンダリング設定**:
| 項目 | 値 |
|------|-----|
| 解像度 | 1080 x 1920 |
| FPS | 30 |
| コーデック | H.264 (High Profile) |
| 音声 | AAC, 48kHz, Stereo |
| 品質 | CRF 18 |

**所要時間目安**: 60秒動画 = 約3-5分

---

### Phase 6: 品質検証

**目的**: 完成動画がInstagram/YouTube仕様に準拠しているか確認。

**3段階チェック**:

#### Check 1: 素材確認
- [ ] 画像枚数 >= シーン数
- [ ] 各画像 > 100KB
- [ ] 音声ファイル数 >= シーン数
- [ ] 各音声の再生時間が適切

#### Check 2: テロップ確認
- [ ] 各テロップ 10-30文字以内
- [ ] 色指定が有効（white/yellow/red）
- [ ] フォントサイズが適切（56-110px）

#### Check 3: 最終動画確認
```bash
ffprobe -v quiet -print_format json -show_format -show_streams video.mp4
```
- [ ] 解像度: 1080x1920
- [ ] FPS: 29-31
- [ ] 長さ: 指定範囲内（デフォルト55-120秒）
- [ ] ファイルサイズ: 10-200MB
- [ ] コーデック: H.264
- [ ] 音声: AAC

**品質レポート出力**: `output/<project>/quality_report.json`

---

## ステート管理

各フェーズの進行状況を `state.json` で管理し、中断からの再開を可能にする。

```json
{
  "project_name": "selective_blindness_rewrite",
  "mode": "new",
  "topic": "選択的盲目",
  "created_at": "2026-02-08T10:00:00Z",
  "current_phase": 3,
  "phases": {
    "1_research": {"status": "completed", "output": "research.json"},
    "2_script": {"status": "completed", "output": "script.json"},
    "3a_images": {"status": "in_progress", "progress": "4/6"},
    "3b_audio": {"status": "pending"},
    "4_compose": {"status": "pending"},
    "5_render": {"status": "pending"},
    "6_quality": {"status": "pending"}
  },
  "errors": []
}
```

**再開コマンド**: `/shorts-create --resume <project_name>`

---

## 出力ディレクトリ構造

```
instagram-shorts-skill/output/<project_name>/
├── state.json              # ステート管理
├── research.json           # Phase 1: リサーチ結果
├── script.json             # Phase 2: スクリプト
├── images/                 # Phase 3a: 画像
│   ├── scene_01.png
│   ├── scene_02.png
│   └── ...
├── audio/                  # Phase 3b: 音声
│   ├── scene_01.mp3
│   ├── scene_02.mp3
│   └── ...
├── remotion/               # Phase 4: コンポジション
│   └── <ProjectName>Video.tsx
├── video.mp4               # Phase 5: 完成動画
└── quality_report.json     # Phase 6: 品質レポート
```

---

## オプション

| オプション | デフォルト | 説明 |
|-----------|-----------|------|
| `--style` | comic | 画像スタイル: comic / photo / mixed |
| `--duration` | 60 | 目標動画長さ（秒） |
| `--scenes` | 6 | シーン数 |
| `--skip-research` | false | リサーチをスキップ |
| `--skip-render` | false | レンダリングをスキップ（TSXまで） |
| `--resume` | - | 中断プロジェクトを再開 |
| `--project-name` | auto | プロジェクト名を指定 |
| `--voice` | timo | 音声: timo / other_voice_id |
| `--rewrite` | false | リライトモード（URL入力時自動判定） |

---

## 依存ツール・スキル

| ツール | 用途 | 必須 |
|--------|------|------|
| Fish Audio API | TTS音声生成 | Yes |
| NanoBanana Pro (Playwright) | コミック風画像生成 | Yes* |
| Pexels MCP | 実写動画/画像素材 | Yes* |
| Pixabay MCP | 補助画像素材 | No |
| Remotion | 動画コンポジション+レンダリング | Yes |
| ffmpeg / ffprobe | メディア操作/検証 | Yes |
| yt-dlp | 動画ダウンロード（リライトモード） | Mode B |

*画像は NanoBanana Pro または Pexels のいずれかで取得

---

## 環境変数（.env）

```bash
FISH_AUDIO_API_KEY=<your_fish_audio_api_key>
# Remotion: node_modules内に自動インストール
```

---

## 実行フロー（AI オーケストレーション）

このスキルが呼ばれたとき、AIは以下の順序で自律的にフェーズを実行する:

```
1. 入力解析
   └─ URLかトピックかを判定 → Mode A or B を選択

2. プロジェクト初期化
   └─ output/<project_name>/ ディレクトリ作成
   └─ state.json 初期化

3. Phase 1: リサーチ
   └─ WebSearch × 3回 → WebFetch → research.json

4. Phase 2: スクリプト
   └─ research.json を入力 → Claude がスクリプト生成 → script.json

5. Phase 3a + 3b: アセット生成（並列実行推奨）
   ├─ 3a: NanoBanana Pro で画像生成（Task Agent 使用）
   └─ 3b: Fish Audio API で音声生成（curl / Task Agent）

6. Phase 4: コンポジション
   └─ 音声長さ計測 → TSX 生成 → public/ にアセット配置

7. Phase 5: レンダリング
   └─ npx remotion render → video.mp4

8. Phase 6: 品質検証
   └─ ffprobe → チェックリスト → quality_report.json
   └─ PASS → 完了報告
   └─ FAIL → エラー箇所を報告、修正提案

9. 完了報告
   └─ 動画パス、品質スコア、所要時間を表示
```

---

## エラーリカバリ

| エラー | 対処 |
|--------|------|
| NanoBanana認証切れ | Playwright で再ログイン → 画像生成リトライ |
| Fish Audio API エラー | 3回リトライ → 失敗時は音声なしで継続 |
| Remotion レンダリング失敗 | エラーログ確認 → TSX修正 → リトライ |
| ffprobe 品質チェック失敗 | 原因特定 → 該当フェーズからやり直し |
| ディスク容量不足 | 警告表示 → 古いプロジェクトの清掃提案 |

---

## 関連スキル

| スキル | 役割 |
|--------|------|
| `nanobanana-pro` | コミック風画像生成 |
| `telop` | テロップエフェクト定義 |
| `agentic-vision` | 動画分析（リライトモード） |
| `research-free` | APIキー不要リサーチ |
| `world-research` | 6層リサーチシステム |
| `video-agent` | 動画操作ユーティリティ |
