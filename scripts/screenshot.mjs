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
  // 资源加载失败（net::ERR_*）在控制台里只有一句没有 URL 的话，看不出是谁挂了；
  // 下面 requestfailed 会带着 URL 再报一次，所以这里丢掉，避免同一次失败报两遍。
  if (m.type() === 'error' && !m.text().includes('net::ERR_')) consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`))

/** 字体 CDN 是外网，本机网络抖一下就 ERR_CERT_*，跟页面代码无关，单独归一类 */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']
const failedRequests = []
page.on('requestfailed', (r) => {
  const url = r.url()
  failedRequests.push({ url, err: r.failure()?.errorText ?? '?', font: FONT_HOSTS.some((h) => url.includes(h)) })
})

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

/**
 * 段落顶端在文档里的位置，从 DOM 现量。
 * 曾经写死 `1100` 这种魔数 —— 首页加一行内容（比如大类切换栏）拍摄点就偏了，
 * 而偏了不会报错，只是拍出来的图不是你想要的段落。
 */
async function topOf(selector, fallback) {
  const top = await page.evaluate(
    (sel) => {
      const el = document.querySelector(sel)
      return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null
    },
    selector,
  )
  if (top === null) console.warn(`! 找不到 ${selector}，退回 ${fallback}`)
  return top ?? fallback
}

const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
console.log(`页面总高 ${pageHeight}px`)

await shootAt('01-hero', 0)
// 大类切换栏 + 品牌导航：内容区的头两行，同一张图里一起看
await shootAt('02-tabs-brands', Math.max(0, (await topOf('#featured', 1100)) - 260))
await shootAt('03-featured', await topOf('#featured', 1100))
await shootAt('04-reviews', Math.round(pageHeight - 900))

console.log('\n控制台错误：', consoleErrors.length === 0 ? '无' : '')
consoleErrors.forEach((e) => console.log('  ✗', e))

// 字体挂了只影响字形，不影响页面对不对 —— 但也别静默咽掉，拍完图看一眼它是真的没发生
const fontFails = failedRequests.filter((r) => r.font)
const realFails = failedRequests.filter((r) => !r.font)
if (fontFails.length) console.log(`字体 CDN 请求失败 ${fontFails.length} 次（外网问题，不算页面错误）`)
realFails.forEach((r) => console.log(`  ✗ 请求失败 ${r.err}  ${r.url}`))

await browser.close()

if (consoleErrors.length > 0 || realFails.length > 0) process.exitCode = 1
