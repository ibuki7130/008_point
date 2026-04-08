/**
 * Global Intelligence System - Core Types
 * カバレッジ: 金融/経済/AI/開発/著名人発言/ニュース
 */

export type IntelligenceCategory =
  | 'finance'         // 金融・株式・FX
  | 'economics'       // 経済指標・マクロ
  | 'ai_news'         // AI・機械学習ニュース
  | 'dev_tools'       // 開発ツール・OSS
  | 'celebrity'       // 著名人・経済界発言
  | 'crypto'          // 暗号資産
  | 'business'        // ビジネス全般
  | 'tech_community'  // 技術コミュニティ

export type SourceType =
  | 'rss'
  | 'api'
  | 'scraper'
  | 'social'

export type ReliabilityScore = 1 | 2 | 3 | 4 | 5

export interface IntelligenceItem {
  id: string
  title: string
  summary: string
  url: string
  source: string
  sourceType: SourceType
  category: IntelligenceCategory
  publishedAt: Date
  fetchedAt: Date
  reliability: ReliabilityScore
  tags: string[]
  sentiment?: 'positive' | 'negative' | 'neutral'
  /** 著名人発言の場合 */
  speaker?: string
  /** 経済指標の場合 */
  indicator?: EconomicIndicator
  /** AI分析結果 */
  analysis?: string
  rawData?: unknown
}

export interface EconomicIndicator {
  name: string
  value: number
  unit: string
  previousValue?: number
  changePercent?: number
  country: string
  date: string
}

export interface CollectorResult {
  items: IntelligenceItem[]
  source: string
  fetchedAt: Date
  error?: string
  itemCount: number
}

export interface IntelligenceConfig {
  newsApiKey?: string       // NewsAPI.org (無料枠あり)
  fredApiKey?: string       // FRED API (完全無料)
  redditClientId?: string   // Reddit API (無料)
  redditClientSecret?: string
  apifyToken?: string       // Apify ($10/月) - SNS用
  claudeApiKey?: string     // AI分析用
  xaiApiKey?: string        // xAI Grok (リアルタイムWeb検索・deep research用)
  maxItemsPerSource?: number
  enabledCategories?: IntelligenceCategory[]
}

export interface WatchTarget {
  name: string
  aliases: string[]
  category: 'ceo' | 'economist' | 'investor' | 'politician' | 'tech_leader'
  importance: 1 | 2 | 3  // 3=最重要
}

/** 監視対象著名人リスト */
export const WATCH_TARGETS: WatchTarget[] = [
  // 投資家
  { name: 'Warren Buffett', aliases: ['バフェット', 'buffett'], category: 'investor', importance: 3 },
  { name: 'Elon Musk', aliases: ['イーロン・マスク', 'musk'], category: 'tech_leader', importance: 3 },
  { name: 'Ray Dalio', aliases: ['ダリオ', 'dalio'], category: 'investor', importance: 3 },
  // テックリーダー
  { name: 'Sam Altman', aliases: ['サム・アルトマン', 'altman'], category: 'tech_leader', importance: 3 },
  { name: 'Dario Amodei', aliases: ['アモデイ', 'amodei'], category: 'tech_leader', importance: 3 },
  { name: 'Jensen Huang', aliases: ['ジェンセン・ファン', 'huang'], category: 'tech_leader', importance: 3 },
  { name: 'Satya Nadella', aliases: ['ナデラ', 'nadella'], category: 'tech_leader', importance: 2 },
  { name: 'Mark Zuckerberg', aliases: ['ザッカーバーグ', 'zuckerberg'], category: 'tech_leader', importance: 2 },
  // 経済学者
  { name: 'Jerome Powell', aliases: ['パウエル', 'powell'], category: 'economist', importance: 3 },
  { name: 'Christine Lagarde', aliases: ['ラガルド', 'lagarde'], category: 'economist', importance: 2 },
  // 日本
  { name: '植田和男', aliases: ['ueda', '植田'], category: 'economist', importance: 3 },
  { name: '石破茂', aliases: ['ishiba'], category: 'politician', importance: 2 },
]

export interface XAccount {
  handle: string          // @なしのハンドル名
  name: string            // 表示名
  language: 'en' | 'ja'
  specialty: ('ai_coding' | 'ai_models' | 'crypto_bot' | 'dev_tools' | 'vibe_coding')[]
  followersApprox: string // フォロワー数概算（2026年初時点）
  description: string     // 専門分野説明
}

/**
 * AI coding / AI models / crypto bot 関連の人気Xアカウント50件
 * Apify collectCelebrityTweets の監視対象として使用
 */
export const X_WATCH_ACCOUNTS: XAccount[] = [
  // ===== English Accounts (25件) =====

  // AI Coding / Vibe Coding (10件)
  { handle: 'karpathy',      name: 'Andrej Karpathy',  language: 'en', specialty: ['ai_coding', 'ai_models'],        followersApprox: '1.7M', description: 'LLM教育・AIコーディング解説・元Tesla/OpenAI' },
  { handle: 'levelsio',      name: 'Pieter Levels',    language: 'en', specialty: ['vibe_coding', 'dev_tools'],      followersApprox: '790K', description: 'バイブコーディング・インディーハック・Claude Code実践' },
  { handle: 'simonw',        name: 'Simon Willison',   language: 'en', specialty: ['ai_coding', 'dev_tools'],        followersApprox: '148K', description: 'Claude Code・LLMツール・Datasette開発者' },
  { handle: 't3dotgg',       name: 'Theo Browne',      language: 'en', specialty: ['ai_coding', 'dev_tools'],        followersApprox: '500K', description: '開発ツール・TypeScript・AIツール評価' },
  { handle: 'rowancheung',   name: 'Rowan Cheung',     language: 'en', specialty: ['ai_coding', 'ai_models'],        followersApprox: '567K', description: 'AIニュース・最新ツール速報' },
  { handle: 'mckaywrigley',  name: 'McKay Wrigley',    language: 'en', specialty: ['ai_coding', 'dev_tools'],        followersApprox: '130K', description: 'Claude Code・AIツール・Cursor活用' },
  { handle: 'GregKamradt',   name: 'Greg Kamradt',     language: 'en', specialty: ['ai_coding', 'dev_tools'],        followersApprox: '90K',  description: 'LLMアプリ開発・RAG・プロンプトエンジニアリング' },
  { handle: 'yoheinakajima', name: 'Yohei Nakajima',   language: 'en', specialty: ['ai_coding', 'dev_tools'],        followersApprox: '150K', description: 'BabyAGI作者・AIエージェント開発' },
  { handle: 'swyx',          name: 'Shawn Wang',        language: 'en', specialty: ['ai_coding', 'dev_tools'],        followersApprox: '100K', description: 'AIエンジニアリング・Latent Space Podcast' },
  { handle: 'hwchase17',     name: 'Harrison Chase',   language: 'en', specialty: ['ai_coding', 'dev_tools'],        followersApprox: '80K',  description: 'LangChain創設者・AIエージェントフレームワーク' },

  // AI Models (8件)
  { handle: 'ylecun',        name: 'Yann LeCun',       language: 'en', specialty: ['ai_models'],                     followersApprox: '970K', description: 'Meta Chief AI Scientist・LLM論争・深層学習の父' },
  { handle: 'AndrewYNg',     name: 'Andrew Ng',        language: 'en', specialty: ['ai_models'],                     followersApprox: '800K', description: 'AI教育・Coursera・DeepLearning.AI' },
  { handle: 'emollick',      name: 'Ethan Mollick',    language: 'en', specialty: ['ai_models'],                     followersApprox: '500K', description: 'LLM実用活用・Wharton教授・AIリテラシー' },
  { handle: 'fchollet',      name: 'François Chollet', language: 'en', specialty: ['ai_models'],                     followersApprox: '800K', description: 'Keras作者・Google・AI研究者' },
  { handle: 'ollama',        name: 'Ollama',           language: 'en', specialty: ['ai_models', 'dev_tools'],        followersApprox: '80K',  description: 'ローカルLLM実行ツール公式アカウント' },
  { handle: 'Kling_ai',      name: 'Kling AI',         language: 'en', specialty: ['ai_models'],                     followersApprox: '127K', description: '動画生成AI Kling公式・最新モデル情報' },
  { handle: 'jeremyphoward', name: 'Jeremy Howard',    language: 'en', specialty: ['ai_models'],                     followersApprox: '200K', description: 'fast.ai共同創設者・実践的AI教育' },
  { handle: 'gdb',           name: 'Greg Brockman',    language: 'en', specialty: ['ai_models'],                     followersApprox: '400K', description: 'OpenAI元社長・GPTシリーズ開発' },

  // Crypto Bot / DeFi (7件)
  { handle: 'VitalikButerin', name: 'Vitalik Buterin', language: 'en', specialty: ['crypto_bot'],                    followersApprox: '5.5M', description: 'Ethereum創設者・DeFiプロトコル' },
  { handle: 'haydenzadams',  name: 'Hayden Adams',     language: 'en', specialty: ['crypto_bot'],                    followersApprox: '420K', description: 'Uniswap創設者・DeFi・自動マーケットメイカー' },
  { handle: 'ScottMelker',   name: 'Scott Melker',     language: 'en', specialty: ['crypto_bot'],                    followersApprox: '550K', description: 'クリプトトレーダー・Wolf Of All Streets' },
  { handle: 'rovercrc',      name: 'CryptoRover',      language: 'en', specialty: ['crypto_bot'],                    followersApprox: '2.1M', description: 'クリプトbot信号・自動売買シグナル' },
  { handle: 'cobie',         name: 'Cobie',            language: 'en', specialty: ['crypto_bot'],                    followersApprox: '720K', description: 'クリプト分析・アルトコイン' },
  { handle: 'lookonchain',   name: 'Lookonchain',      language: 'en', specialty: ['crypto_bot'],                    followersApprox: '700K', description: 'オンチェーン分析・ウォレット追跡・bot活動監視' },
  { handle: 'WhalePanda',    name: 'WhalePanda',       language: 'en', specialty: ['crypto_bot'],                    followersApprox: '310K', description: 'クリプト分析・ビットコイン・bot戦略' },

  // ===== Japanese Accounts (25件) =====

  // AI Coding / バイブコーディング (12件)
  { handle: 'kinopee_ai',    name: 'kinopee',          language: 'ja', specialty: ['ai_coding', 'vibe_coding'],      followersApprox: '不明', description: 'AIコーディング・Claude Code・Cursor実践情報' },
  { handle: 'muscle_coding', name: 'マッスルコーディング', language: 'ja', specialty: ['vibe_coding', 'ai_coding'], followersApprox: '不明', description: 'バイブコーディング・AIツールによるアプリ開発' },
  { handle: 'yoshidashingo', name: '吉田真吾',          language: 'ja', specialty: ['ai_coding', 'dev_tools'],       followersApprox: '不明', description: 'AI活用・Claude Code・エンジニアリング実践' },
  { handle: 'Shin_Engineer', name: 'シン・エンジニア',  language: 'ja', specialty: ['ai_coding'],                    followersApprox: '不明', description: 'AI開発・最新ツール情報発信' },
  { handle: 'taichi_we',     name: 'たいち',           language: 'ja', specialty: ['vibe_coding', 'ai_coding'],      followersApprox: '不明', description: 'バイブコーディング・Claude Code・ノーコード開発' },
  { handle: 'kamui_qai',     name: 'kamui',            language: 'ja', specialty: ['ai_coding', 'dev_tools'],        followersApprox: '不明', description: 'AI開発ツール・Cursor・Windsurf使い方' },
  { handle: 'shimabu_it',    name: 'しまぶー',          language: 'ja', specialty: ['ai_coding', 'dev_tools'],        followersApprox: '不明', description: 'フロントエンド・AIツール・React開発' },
  { handle: 'tetumemo',      name: 'てつメモ',          language: 'ja', specialty: ['ai_coding', 'ai_models'],        followersApprox: '不明', description: 'AIツール・最新モデル情報・開発メモ' },
  { handle: 'shota7180',     name: 'shota',            language: 'ja', specialty: ['ai_coding'],                     followersApprox: '不明', description: 'AI開発・vibe coding実践' },
  { handle: 'fladdict',      name: '深津貴之',          language: 'ja', specialty: ['ai_coding', 'ai_models'],        followersApprox: '不明', description: 'AI・デザイン・NHKメディア研究所・Claude活用' },
  { handle: 'npaka',         name: 'npaka',            language: 'ja', specialty: ['ai_coding', 'ai_models'],        followersApprox: '不明', description: 'LLMプログラミング・Zenn執筆・AI実装チュートリアル' },
  { handle: 'shi3z',         name: '清水亮',            language: 'ja', specialty: ['ai_coding', 'ai_models'],        followersApprox: '不明', description: 'AI研究・批評・起業家・AGI論' },

  // AI Models (5件)
  { handle: 'keitowebai',    name: 'けいとweb AI',     language: 'ja', specialty: ['ai_models'],                     followersApprox: '不明', description: 'AIモデル情報・最新LLM速報' },
  { handle: 'hillbig',       name: '岡野原大輔',        language: 'ja', specialty: ['ai_models'],                     followersApprox: '不明', description: 'Preferred Networks・AI研究・深層学習' },
  { handle: 'masahirochaen', name: '前田雅幸',          language: 'ja', specialty: ['ai_models'],                     followersApprox: '不明', description: 'AI情報発信・最新モデル解説' },
  { handle: 'karaage0703',   name: 'からあげ',          language: 'ja', specialty: ['ai_models', 'dev_tools'],        followersApprox: '不明', description: '機械学習・エッジAI・ラズパイ・AIものづくり' },
  { handle: 'kazzion',       name: 'kazzion',          language: 'ja', specialty: ['ai_models', 'ai_coding'],        followersApprox: '不明', description: 'AI/MLエンジニア・最新モデル実験' },

  // Crypto Bot / 自動売買 (8件)
  { handle: 'IHayato',       name: '林勇貴',            language: 'ja', specialty: ['crypto_bot'],                    followersApprox: '不明', description: 'クリプトbot・自動売買・アルゴリズムトレード' },
  { handle: 'Kazmax_83',     name: 'Kazmax',           language: 'ja', specialty: ['crypto_bot'],                    followersApprox: '不明', description: '暗号資産bot・自動売買戦略' },
  { handle: 'bakuagecoin',   name: '暴上げコイン',      language: 'ja', specialty: ['crypto_bot'],                    followersApprox: '不明', description: 'クリプト情報・アルトコイン発掘' },
  { handle: 'sen_axis',      name: 'Sen',              language: 'ja', specialty: ['crypto_bot'],                    followersApprox: '不明', description: 'クリプトbot分析・DeFi戦略' },
  { handle: 'shingen_crypto', name: '信玄',            language: 'ja', specialty: ['crypto_bot'],                    followersApprox: '不明', description: '暗号資産・bot・自動売買システム構築' },
  { handle: 'nori_0083',     name: 'nori',             language: 'ja', specialty: ['crypto_bot'],                    followersApprox: '不明', description: 'クリプトbot・DeFi・自動化戦略' },
  { handle: 'botter_nj',     name: 'bot爺',            language: 'ja', specialty: ['crypto_bot'],                    followersApprox: '不明', description: 'クリプトbot・アルゴリズムトレード' },
  { handle: 'taka_trade777', name: 'タカ',             language: 'ja', specialty: ['crypto_bot'],                    followersApprox: '不明', description: '暗号資産・自動売買・トレード戦略' },
]

/** X_WATCH_ACCOUNTS から Apify 用のハンドルリストを取得 */
export const getXHandles = (filter?: { language?: 'en' | 'ja', specialty?: XAccount['specialty'][number] }): string[] => {
  return X_WATCH_ACCOUNTS
    .filter(a => {
      if (filter?.language && a.language !== filter.language) return false
      if (filter?.specialty && !a.specialty.includes(filter.specialty)) return false
      return true
    })
    .map(a => a.handle)
}

/** 監視キーワードリスト */
export const WATCH_KEYWORDS = {
  ai_coding: ['claude code', 'cursor', 'windsurf', 'opencode', 'openclaw', 'vibe coding', 'copilot', 'devin', 'github copilot', 'skill', 'github'],
  ai_models: ['gpt-5', 'claude 4', 'gemini', 'llama', 'mistral', 'anthropic', 'openai', 'nanobanana', 'ollama', 'seedance', 'kling', 'minmax', 'minimax'],
  finance: ['federal reserve', 'interest rate', 'inflation', 'recession', 'nasdaq', 'sp500', '日銀', '為替'],
  crypto: ['bitcoin', 'ethereum', 'btc', 'eth', 'defi', 'nft', 'bot'],
  dev_tools: ['mcp', 'model context protocol', 'langchain', 'langgraph', 'n8n', 'zapier'],
}
