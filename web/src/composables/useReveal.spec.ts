import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `data-reveal` 与 `useReveal` 的配对检查。
 *
 * ── 这条不变量为什么值得一个测试 ──────────────────────────────────
 *
 * 滚动入场是**两半**的：
 *
 * - CSS 半（main.css）：`[data-reveal] { opacity: 0 }` —— 首屏前先藏住，避免闪一下终态
 * - JS 半（useReveal）：把 opacity 补间回 1
 *
 * 少了 JS 半，元素就是**永久隐形**的。而且这个故障几乎查不出来：
 *
 * 1. 不报错。控制台干干净净，DOM 里文字都在，`textContent` / `innerText` 都能取到，
 *    `getBoundingClientRect()` 也量得出正常尺寸 —— 只有 `opacity` 是 0。
 * 2. `prefers-reduced-motion` 下 main.css 的兜底会把 `[data-reveal]` 直接设成 `opacity: 1`，
 *    于是**只测减弱动效的话永远发现不了**。
 *
 * 2026-10-16 就是这么漏的：`SpecTable.vue` 和 `VoucherCards.vue` 写了 `data-reveal`
 * 却没人调 `useReveal`，详情页整页只剩 hero 与页脚可见，中间全是空白。
 * 靠一句「记得配对」防不住，靠断言才防得住。
 */
const SRC = join(process.cwd(), 'src')

function walkVue(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walkVue(full) : full.endsWith('.vue') ? [full] : []
  })
}

/** 去掉 HTML 注释与 JS 注释 —— 注释里提到 `data-reveal` 不算「渲染了它」 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('data-reveal / useReveal 配对', () => {
  const files = walkVue(SRC)

  it('确实扫到了组件文件（防止扫描失效后整组测试变成空过）', () => {
    expect(files.length).toBeGreaterThan(15)
    expect(files.some((f) => f.endsWith('SpecTable.vue'))).toBe(true)
  })

  it('每个渲染 data-reveal 的组件都调用了 useReveal', () => {
    const offenders = files
      .filter((file) => {
        const raw = readFileSync(file, 'utf8')
        return stripComments(raw).includes('data-reveal') && !raw.includes('useReveal(')
      })
      .map((file) => relative(process.cwd(), file))

    expect(offenders).toEqual([])
  })

  it('main.css 仍然给了 [data-reveal] 初始 opacity: 0（否则 CSS 半没了，动画会闪）', () => {
    const css = readFileSync(join(SRC, 'styles/main.css'), 'utf8')
    const block = css.match(/\[data-reveal\]\s*\{[^}]*\}/)
    expect(block?.[0]).toMatch(/opacity:\s*0/)
  })
})
