/**
 * 验收截图：用系统 Chrome 把首页各段落拍下来，供人工 review。
 *
 * 用法：
 *   pnpm dev                       # 另开一个终端
 *   node scripts/screenshot.mjs [url] [outDir]
 *
 * 之所以不装完整 puppeteer：只要 puppeteer-core 就能驱动本机已有的 Chrome，
 * 不必再下一份 Chromium（几百 MB）。
 */
import puppeteer from 'puppeteer-core'
import { mkdir } from 'node:fs/promises'

const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const OUT = process.argv[3] ?? '/tmp/hmdp-shots'

await mkdir(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
})

const page = await browser.newPage()

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`))

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60_000 })

// 等入场时间线跑完（hero 时间线约 2.3s + 背景 2.8s）
await new Promise((r) => setTimeout(r, 3800))

/** 用原生 scrollTo 而非 scrollIntoView —— 后者会被 Lenis 的平滑逻辑打断 */
async function shootAt(name, y) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
  await new Promise((r) => setTimeout(r, 1800)) // 等 ScrollTrigger scrub 追平
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`✓ ${name}.png  (scrollY=${y})`)
}

const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
console.log(`页面总高 ${pageHeight}px`)

await shootAt('01-hero', 0)
await shootAt('02-featured', 1100)
await shootAt('03-reviews', Math.round(pageHeight - 900))

console.log('\n控制台错误：', consoleErrors.length === 0 ? '无' : '')
consoleErrors.forEach((e) => console.log('  ✗', e))

await browser.close()

if (consoleErrors.length > 0) process.exitCode = 1
