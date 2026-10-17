import { computed, onUnmounted, ref, type ComputedRef, type Ref } from 'vue'

/**
 * 获取验证码按钮的倒计时。
 *
 * ── 为什么是「算截止时刻」而不是「每秒减一」────────────────────────────────
 *
 * 每秒 `n--` 的写法在真实浏览器里会慢：标签页切到后台时定时器被节流（Chrome 可压到
 * 1 次/分钟），回来时显示的还是切走前那个数字 —— 用户看到「58s」愣了半天不动，
 * 或者更糟，倒计时早就结束了却还在拦着他点。
 *
 * 这里记的是**截止时间戳**，每次 tick 重新算差值，所以节流只影响刷新频率、不影响正确性。
 * 代价是必须有个计时钟可注入，单测才能在不真等 60 秒的情况下验证边界 —— 这个代价
 * 正好换来可测性，两头都赚。
 */

export interface CountdownOptions {
  /** 计时钟。默认 `Date.now`；单测注入假时钟即可脱离真实时间 */
  now?: () => number
  /**
   * 轮询间隔。取小于 1 秒是为了让秒数**跳得准**：
   * 1 秒一跳的话，从 start() 到第一次 tick 之间的显示会偏最多 1 秒。
   */
  intervalMs?: number
  /** 归零时的回调，用于恢复按钮文案、允许重新获取 */
  onFinish?: () => void
}

export interface Countdown {
  /** 剩余秒数，归零后为 0 */
  seconds: Ref<number>
  /** 是否正在倒计时（`seconds > 0`） */
  running: ComputedRef<boolean>
  /** 开始倒计时。可重复调用（重新获取验证码时重置） */
  start: (seconds?: number) => void
  /** 提前停止，秒数归零 */
  stop: () => void
}

export function useCountdown(totalSeconds: number, options: CountdownOptions = {}): Countdown {
  const { now = Date.now, intervalMs = 250, onFinish } = options

  const seconds = ref(0)
  const running = computed(() => seconds.value > 0)

  let timer: ReturnType<typeof setInterval> | null = null
  let deadline = 0

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    seconds.value = 0
  }

  function tick(): void {
    // ceil：剩 0.4 秒时显示「1s」而不是「0s」—— 显示 0 就该能点了
    const left = Math.max(0, Math.ceil((deadline - now()) / 1000))
    seconds.value = left
    if (left === 0) {
      stop()
      onFinish?.()
    }
  }

  function start(secondsToRun: number = totalSeconds): void {
    // 先清掉可能还在跑的旧定时器，否则连点两次会有两个 interval 同时写 seconds
    if (timer !== null) clearInterval(timer)
    deadline = now() + secondsToRun * 1000
    seconds.value = secondsToRun
    timer = setInterval(tick, intervalMs)
  }

  // 组件卸载必须清掉 —— 定时器持有闭包，留着等于把这个组件泄漏到页面离开之后
  onUnmounted(stop)

  return { seconds, running, start, stop }
}
