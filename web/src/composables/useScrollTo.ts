import { lenis, prefersReducedMotion } from '@/lib/lenis'

/**
 * 用 Lenis 滚动到目标。**不要用 `window.scrollTo`** ——
 * 绕过 Lenis 会让平滑滚动的内部位置与真实位置不同步，ScrollTrigger 跟着算错。
 */
export function useScrollTo() {
  function scrollTo(target: string | number | HTMLElement, offset = 0) {
    lenis.scrollTo(target, {
      offset,
      duration: prefersReducedMotion() ? 0 : 1.4,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
  }

  return { scrollTo }
}
