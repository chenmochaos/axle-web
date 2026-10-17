import Lenis from 'lenis'
import { gsap, ScrollTrigger } from './gsap'

/**
 * 系统是否要求减弱动效。全局只探测一次，各 composable 复用。
 */
export const reducedMotionQuery =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

export const prefersReducedMotion = () => reducedMotionQuery?.matches ?? false

/**
 * 全应用唯一的 Lenis 实例。
 *
 * ⚠️ 组件里永远不要 `new Lenis()` —— 第二个实例会和 GSAP ticker 抢 rAF，
 * 表现为滚动抖动 + 动画掉帧。要用就 import 这个单例。
 */
export const lenis = new Lenis({
  duration: 1.15,
  // 标准指数衰减缓动，长尾收得比默认更干净
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: !prefersReducedMotion(),
  wheelMultiplier: 1,
  touchMultiplier: 1.5,
  autoRaf: false, // 交给 GSAP ticker 驱动，别自己开 rAF
})

/* ─────────────────────────────────────────────────────────────
   Lenis ↔ GSAP 同步。三行缺一不可，漏了 lagSmoothing(0) 会抖。
   ───────────────────────────────────────────────────────────── */
lenis.on('scroll', ScrollTrigger.update)

gsap.ticker.add((time) => {
  lenis.raf(time * 1000) // GSAP 给的是秒，Lenis 要毫秒
})

gsap.ticker.lagSmoothing(0)
