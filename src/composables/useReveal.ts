import { onMounted, onUnmounted, type Ref } from 'vue'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { prefersReducedMotion } from '@/lib/lenis'

export interface RevealOptions {
  /** 元素进入视口多少时触发，0.2 = 露出 20% */
  start?: string
  /** 子元素交错间隔（秒） */
  stagger?: number
  /** 位移起点（px），负数从下往上 */
  y?: number
  /** 是否让子元素逐个入场，关掉则整体一起 */
  children?: boolean
}

/**
 * 滚动入场。作用于容器内所有 `[data-reveal]` 元素。
 *
 * 元素初始 opacity: 0 由 main.css 的 `[data-reveal]` 规则给，
 * 这样首屏渲染前就隐藏，不会闪一下再动。
 */
export function useReveal(container: Ref<HTMLElement | null>, options: RevealOptions = {}) {
  const { start = 'top 85%', stagger = 0.08, y = 28, children = false } = options

  let ctx: gsap.Context | null = null

  onMounted(() => {
    const root = container.value
    if (!root) return

    const targets = children
      ? Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
      : [root]

    if (targets.length === 0) return

    if (prefersReducedMotion()) {
      gsap.set(targets, { opacity: 1, y: 0 })
      return
    }

    ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: 'expo.out',
          stagger,
          scrollTrigger: {
            trigger: root,
            start,
            once: true,
          },
        },
      )
    }, root)
  })

  onUnmounted(() => {
    ctx?.revert()
  })
}

/** 手动刷新（图片加载完导致布局高度变化时用） */
export function refreshScrollTriggers() {
  ScrollTrigger.refresh()
}
