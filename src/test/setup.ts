/**
 * jsdom 缺失的浏览器 API 垫片。
 *
 * 这里补的都不是「为了让测试过」的假实现，而是真实浏览器里存在、
 * jsdom 没实现的东西 —— 缺了它们，被测模块在 import 阶段就会抛。
 */
import { vi } from 'vitest'

/**
 * GSAP 的 ScrollTrigger 在 registerPlugin 时会用 matchMedia 探测
 * `(prefers-reduced-motion: reduce)`，jsdom 不实现 matchMedia，
 * 不补的话任何 import 到 @/lib/gsap 的模块都会在加载期直接崩。
 */
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, // 默认按「未要求减弱动效」处理
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

/** GSAP 与 Lenis 都会观察元素尺寸，jsdom 同样没有 */
if (!window.ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  })
}
