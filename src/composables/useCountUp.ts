import { ref, watch, onUnmounted, isRef, type Ref } from 'vue'
import { gsap } from '@/lib/gsap'
import { prefersReducedMotion } from '@/lib/lenis'

/**
 * 千分位 + 定点小数格式化。价格、里程、年款的数字质感全走这里，
 * 保证补间过程中每一帧都是合法显示值（不会出现 12345.6789）。
 */
export function formatCount(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '0'

  const fixed = value.toFixed(decimals)
  const [intPart = '0', fracPart] = fixed.split('.')
  const sign = intPart.startsWith('-') ? '-' : ''
  const digits = sign ? intPart.slice(1) : intPart
  // 从右往左每三位插一个逗号
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return sign + grouped + (fracPart ? `.${fracPart}` : '')
}

export interface CountUpOptions {
  /** 小数位，价格 0、里程 1、排量 1 */
  decimals?: number
  /** 补间时长（秒） */
  duration?: number
  /** 起始值，默认 0 */
  from?: number
}

/**
 * 数字滚动：目标值变化时从当前显示值补间过去。
 *
 * 返回的 `display` 已经格式化好，直接渲染即可。
 * 系统要求减弱动效时直接跳到目标值。
 */
export function useCountUp(
  target: number | Ref<number>,
  options: CountUpOptions = {},
): { display: Ref<string> } {
  const { decimals = 0, duration = 1.4, from = 0 } = options

  const source = isRef(target) ? target : ref(target)
  const current = ref(from)
  const display = ref(formatCount(from, decimals))

  let tween: gsap.core.Tween | null = null

  const render = (v: number) => {
    current.value = v
    display.value = formatCount(v, decimals)
  }

  const run = (to: number, immediate = false) => {
    tween?.kill()

    if (immediate || prefersReducedMotion()) {
      render(to)
      return
    }

    const proxy = { v: current.value }
    tween = gsap.to(proxy, {
      v: to,
      duration,
      ease: 'expo.out',
      onUpdate: () => render(proxy.v),
      onComplete: () => render(to),
    })
  }

  watch(source, (v) => run(v, false), { immediate: true })

  onUnmounted(() => tween?.kill())

  return { display }
}
