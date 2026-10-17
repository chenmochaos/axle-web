import { nextTick, onMounted, onUnmounted, watch, type Ref } from 'vue'
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
  /**
   * 内容**异步到达**时传它：`ready` 变 true 之前不建动画。
   *
   * 不传时的行为与从前完全一致（`onMounted` 里建）。
   *
   * 为什么需要：`onMounted` 那一刻容器里可能一个 `[data-reveal]` 都没有
   * （视图先挂载、数据后到）—— 早退之后，新出现的元素拿到的是 main.css 给的
   * `opacity: 0`，背后却没有任何动画去揭开它们：**整页隐形，控制台一片安静**。
   * CLAUDE.md §6 记的就是这个坑，之前靠「把内容塞进子组件」绕过去；
   * 视图自己渲染的区块没法绕，只能让 composable 知道「现在还不能建」。
   */
  ready?: Ref<boolean>
}

/**
 * 滚动入场。作用于容器内所有 `[data-reveal]` 元素。
 *
 * 元素初始 opacity: 0 由 main.css 的 `[data-reveal]` 规则给，
 * 这样首屏渲染前就隐藏，不会闪一下再动。
 *
 * **一个 `[data-reveal]` 只该有一个宿主**：谁渲染这块标记，谁负责揭开它。
 * 两层同时 reveal 会让同一元素上叠两个补间，最后一个生效 —— 不报错，但抖。
 */
export function useReveal(container: Ref<HTMLElement | null>, options: RevealOptions = {}) {
  const { start = 'top 85%', stagger = 0.08, y = 28, children = false, ready } = options

  let ctx: gsap.Context | null = null
  /** 只在「真的建了动画」时置位：容器还是空的时候不算跑过，后面还得再来一次 */
  let done = false

  function run() {
    if (done) return
    const root = container.value
    if (!root) return

    const targets = children
      ? Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
      : [root]

    if (targets.length === 0) return
    done = true

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
  }

  onMounted(() => {
    if (!ready || ready.value) run()
  })

  if (ready) {
    // 等 DOM 打完补丁再找元素。`watch` 默认 pre-flush，回调跑在重渲染**之前**
    watch(ready, (v) => {
      if (v) nextTick(run)
    })
  }

  onUnmounted(() => {
    ctx?.revert()
  })
}

/** 手动刷新（图片加载完导致布局高度变化时用） */
export function refreshScrollTriggers() {
  ScrollTrigger.refresh()
}
