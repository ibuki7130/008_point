import { chromium } from 'playwright-core'

export interface HapitasDeal {
  name: string
  points: string
  pointsNum: number
  condition: string
  category: string
  url: string
}

/**
 * ハピタスに会員ログインして高還元案件を取得
 * Playwrightでブラウザ自動操作。1日1回の実行を想定。
 */
export async function scrapeHapitasDeals(): Promise<HapitasDeal[]> {
  const email = process.env.HAPITAS_EMAIL
  const password = process.env.HAPITAS_PASSWORD

  if (!email || !password) {
    throw new Error('HAPITAS_EMAIL / HAPITAS_PASSWORD が .env に未設定です')
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'ja-JP',
  })
  const page = await context.newPage()

  try {
    // 1. ログイン
    await page.goto('https://hapitas.jp/login', { waitUntil: 'networkidle' })
    await page.fill('input[name="email"], input[type="email"]', email)
    await page.fill('input[name="password"], input[type="password"]', password)
    await page.click('button[type="submit"], input[type="submit"]')
    await page.waitForNavigation({ waitUntil: 'networkidle' })

    // ログイン失敗チェック
    if (page.url().includes('login')) {
      throw new Error('ハピタスへのログインに失敗しました。認証情報を確認してください')
    }

    console.log('[scraper] ログイン成功')

    // 2. 高還元案件ページを取得（ポイント降順）
    const deals: HapitasDeal[] = []

    const targets = [
      { url: 'https://hapitas.jp/item/list?sort=point&order=desc', category: '高還元' },
      { url: 'https://hapitas.jp/item/list?type=campaign', category: 'キャンペーン' },
    ]

    for (const target of targets) {
      await page.goto(target.url, { waitUntil: 'networkidle' })

      // 案件カードを取得（複数のセレクタパターンに対応）
      const items = await page.$$eval(
        '.item-list__item, .js-item, [class*="item-card"], [class*="ad-item"]',
        (els) => els.map((el) => {
          const name = (
            el.querySelector('[class*="name"], [class*="title"], h3, h4')?.textContent || ''
          ).trim()
          const pointText = (
            el.querySelector('[class*="point"], [class*="pt"]')?.textContent || ''
          ).trim()
          const condition = (
            el.querySelector('[class*="condition"], [class*="detail"], [class*="note"]')?.textContent || ''
          ).trim()
          const href = (el.querySelector('a') as HTMLAnchorElement)?.href || ''

          return { name, pointText, condition, href }
        })
      )

      for (const item of items) {
        if (!item.name || !item.pointText) continue
        const pointsNum = parseInt(item.pointText.replace(/[^0-9]/g, '')) || 0
        if (pointsNum < 500) continue

        deals.push({
          name: item.name,
          points: item.pointText,
          pointsNum,
          condition: item.condition || '条件は案件ページをご確認ください',
          category: target.category,
          url: item.href || target.url,
        })
      }
    }

    // 重複除去・ポイント降順・上位5件
    const unique = deals.filter(
      (d, i, arr) => arr.findIndex((x) => x.name === d.name) === i
    )
    const result = unique.sort((a, b) => b.pointsNum - a.pointsNum).slice(0, 5)

    console.log(`[scraper] 案件取得完了: ${result.length}件`)
    return result
  } finally {
    await browser.close()
  }
}
