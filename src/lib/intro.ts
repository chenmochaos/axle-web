/**
 * 开场幕布的闸门（与 `lib/gsap.ts`、`lib/lenis.ts` 同为模块单例）。
 *
 * 两件事：
 *
 * 1. **要不要放幕布** —— 这个判断只在 `index.html` 的内联脚本里写一次，那里必须早于
 *    bundle 执行才能防住首帧白闪。这里只读它留下的 `intro-boot` class，不重复判断条件。
 *    改判断条件去改 `index.html`，不要在别处再写一份。
 *
 * 2. **首屏什么时候起手** —— `HeroSection` await 这个闸门，幕布升到 35% 时闸门放开，
 *    于是「幕布升起」和「首屏入场」在时间轴上重叠，读起来是一次运动而不是两段。
 *    没有幕布时（非首次访问、深链、减弱动效）闸门立刻放开，首屏入场不受影响。
 */

let release!: () => void

/** 首屏入场时间线要 await 的 Promise。幕布结束前一直 pending。 */
export const introDone = new Promise<void>((resolve) => {
  release = resolve
})

/** 本次导航会不会放幕布。由 `index.html` 的内联脚本决定。 */
export const introWillPlay =
  typeof document !== 'undefined' && document.documentElement.classList.contains('intro-boot')

if (!introWillPlay) release()

/**
 * 幕布组件挂载后调用：它自己的黑已经画上去了，可以撤掉 `<html>` 上的兜底黑。
 * 不撤的话 `html` 一直是黑的，页面滚到底会看到黑边。
 */
export function clearBootPaint() {
  document.documentElement.classList.remove('intro-boot')
}

/**
 * 幕布揭开到交接点时调用：记下「本次会话已放过」+ 放行首屏。幂等 ——
 * 时间线可能因为标签页切后台而重复触发，重复调用不会出错。
 */
export function finishIntro() {
  try {
    sessionStorage.setItem('axle:intro', '1')
  } catch {
    /* 隐私模式写不进去 —— 大不了下次访问再看一遍幕布 */
  }
  release()
}
