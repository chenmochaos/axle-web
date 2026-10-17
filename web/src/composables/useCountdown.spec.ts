import { describe, it, expect, vi, afterEach } from 'vitest'
import { createApp, defineComponent, h, type App } from 'vue'
import { useCountdown, type Countdown } from './useCountdown'

/**
 * 倒计时的用例。
 *
 * 用 `createApp` 真挂一个空组件来跑，而不是直接调 `useCountdown()` —— 因为
 * `onUnmounted` 只在组件实例里有效，直接调会拿到一句 Vue 警告，而「卸载时清掉定时器」
 * 恰恰是本文件最该验的一条（不清就是把组件泄漏到页面离开之后）。用真实例测，
 * 这条就不是纸面承诺了。
 *
 * 计时钟是注入的，所以不需要真的等 60 秒；但 `setInterval` 走真实定时器也没关系 ——
 * 下面所有关于「秒数」的断言都只依赖注入的时钟，不依赖真实时间的流逝。
 */

function withSetup<T>(fn: () => T): { result: T; app: App } {
  let result!: T
  const app = createApp(
    defineComponent({
      setup() {
        result = fn()
        return () => h('div')
      },
    }),
  )
  app.mount(document.createElement('div'))
  return { result, app }
}

/** 可手动推进的假时钟 */
function fakeClock(startAt = 1_700_000_000_000) {
  let t = startAt
  return {
    now: () => t,
    advance(ms: number) {
      t += ms
    },
  }
}

const mounted: App[] = []
function mountCountdown(...args: Parameters<typeof useCountdown>): Countdown {
  const { result, app } = withSetup(() => useCountdown(...args))
  mounted.push(app)
  return result
}

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount())
  vi.useRealTimers()
})

describe('useCountdown', () => {
  it('初始是 0 秒、未在倒计时', () => {
    const c = mountCountdown(60)
    expect(c.seconds.value).toBe(0)
    expect(c.running.value).toBe(false)
  })

  it('start() 后立刻显示总秒数', () => {
    const clock = fakeClock()
    const c = mountCountdown(60, { now: clock.now })
    c.start()
    expect(c.seconds.value).toBe(60)
    expect(c.running.value).toBe(true)
    c.stop()
  })

  it('秒数随注入时钟递减', () => {
    vi.useFakeTimers()
    const clock = fakeClock()
    const c = mountCountdown(60, { now: clock.now, intervalMs: 10 })
    c.start()

    clock.advance(1000)
    vi.advanceTimersByTime(20)
    expect(c.seconds.value).toBe(59)

    clock.advance(9000)
    vi.advanceTimersByTime(20)
    expect(c.seconds.value).toBe(50)

    c.stop()
  })

  it('剩 0.4 秒时显示 1 而不是 0 —— 显示 0 就该能点了', () => {
    vi.useFakeTimers()
    const clock = fakeClock()
    const c = mountCountdown(60, { now: clock.now, intervalMs: 10 })
    c.start()

    clock.advance(59_600)
    vi.advanceTimersByTime(20)
    expect(c.seconds.value).toBe(1)

    c.stop()
  })

  it('走到 0 后自动停下，并调 onFinish', () => {
    vi.useFakeTimers()
    const clock = fakeClock()
    const onFinish = vi.fn()
    const c = mountCountdown(60, { now: clock.now, intervalMs: 10, onFinish })
    c.start()

    clock.advance(60_000)
    vi.advanceTimersByTime(20)
    expect(c.seconds.value).toBe(0)
    expect(c.running.value).toBe(false)
    expect(onFinish).toHaveBeenCalledTimes(1)

    // 到点之后时钟继续走，不该再触发第二次 onFinish
    clock.advance(5000)
    vi.advanceTimersByTime(50)
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(c.seconds.value).toBe(0)
  })

  it('时钟被「节流」跳过一段也不影响正确性（这正是用截止时刻的理由）', () => {
    vi.useFakeTimers()
    const clock = fakeClock()
    const c = mountCountdown(60, { now: clock.now, intervalMs: 10 })
    c.start()

    // 模拟标签页切到后台 20 秒，一次 tick 都没跑
    clock.advance(20_000)
    vi.advanceTimersByTime(20)
    // 「每秒减一」的实现这时会显示 59；算截止时刻的实现显示 40
    expect(c.seconds.value).toBe(40)

    c.stop()
  })

  it('重复 start() 会重置，且不会留下两个定时器打架', () => {
    vi.useFakeTimers()
    const clock = fakeClock()
    const onFinish = vi.fn()
    const c = mountCountdown(60, { now: clock.now, intervalMs: 10, onFinish })
    c.start()

    clock.advance(30_000)
    vi.advanceTimersByTime(20)
    expect(c.seconds.value).toBe(30)

    c.start() // 重新获取验证码
    expect(c.seconds.value).toBe(60)

    // 若旧定时器没清掉，它会按老 deadline 把秒数写成 0 并触发 onFinish
    clock.advance(30_000)
    vi.advanceTimersByTime(20)
    expect(c.seconds.value).toBe(30)
    expect(onFinish).not.toHaveBeenCalled()

    c.stop()
  })

  it('stop() 归零并停止', () => {
    vi.useFakeTimers()
    const clock = fakeClock()
    const c = mountCountdown(60, { now: clock.now, intervalMs: 10 })
    c.start()
    c.stop()
    expect(c.seconds.value).toBe(0)
    expect(c.running.value).toBe(false)

    clock.advance(1000)
    vi.advanceTimersByTime(20)
    expect(c.seconds.value).toBe(0) // 已停，不再被写
  })

  it('组件卸载后定时器不再写值（这是 onUnmounted 那条的实际内容）', () => {
    vi.useFakeTimers()
    const clock = fakeClock()
    const { result: c, app } = withSetup(() =>
      useCountdown(60, { now: clock.now, intervalMs: 10 }),
    )
    c.start()
    expect(c.seconds.value).toBe(60)

    app.unmount()
    // 卸载会走 stop()，它把秒数归零 —— 所以这里是 0，不是 60
    expect(c.seconds.value).toBe(0)

    clock.advance(30_000)
    vi.advanceTimersByTime(50)
    // 判据是「0，而不是 30」：定时器若还活着，会按 deadline 把秒数写成 30。
    // 归零本身不说明问题，归零之后**不再被改写**才说明问题。
    expect(c.seconds.value).toBe(0)
  })

  it('不支持 start(0) 之外的负数 —— 传 0 就是立刻结束', () => {
    vi.useFakeTimers()
    const clock = fakeClock()
    const c = mountCountdown(60, { now: clock.now, intervalMs: 10 })
    c.start(0)
    vi.advanceTimersByTime(20)
    expect(c.seconds.value).toBe(0)
    expect(c.running.value).toBe(false)
  })
})
