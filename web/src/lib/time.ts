/**
 * 时间显示。**所有把 ISO 字符串变给人看的地方都走这里。**
 *
 * 起因是 `VoucherCards` 与 `StickyBuyBar` 各写了一份一模一样的 `monthDay` ——
 * 两份同义的格式化函数，改一处忘一处就会出现「同一张券在详情页和操作条上日期不一样」。
 *
 * ── 关于解析：为什么用 `Date.parse` 而不是 dayjs ──────────────────────────
 *
 * 后端的 `begin_time` / `end_time` 是 **naive local datetime**（`LocalDateTime`，
 * 序列化出来形如 `2026-10-20T00:00:00`，不带时区）。`Date.parse` 对不带时区的串
 * 按**本地时区**解释，与后端的语义一致，所以直接用就好，不需要引日期库。
 *
 * ⚠️ 反过来说：如果哪天后端改成带 `Z` 的 UTC 串，这里就会整体偏 8 小时。
 * 到那时要显式处理，而不是继续依赖「没带时区」这个前提。
 */

/**
 * ISO 串 → `MM/DD`。解析不了就给空串。
 *
 * 只切字符串、不走 Date 是刻意的：日期部分就是前 10 个字符，切出来必然正确，
 * 而 `new Date(...).getMonth()` 会引入时区这一步，白白多一个出错的地方。
 */
export function monthDay(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(5, 10).replace('-', '/')
}

/**
 * 剩余毫秒 → 人读的倒计时。
 *
 * 规则：
 * - `<= 0` → `已结束`
 * - 不足一天 → `HH:MM:SS`
 * - 超过一天 → `N 天 HH:MM:SS`
 *
 * **不进位**：剩 1 天 23:59:59 显示 `1 天 23:59:59`（不是 2 天），
 * 剩 0.9 秒显示 `00:00:00` 而不是 `已结束` —— 只有真的到点才说结束，
 * 早说一秒就是界面在替后端下结论。
 */
export function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '已结束'

  // 向下取整到秒：剩 0.9 秒算 0 秒，配合上面的 ms<=0 判据，界面只会「晚说」不会「早说」
  const total = Math.floor(ms / 1000)
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  const clock = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
  return days > 0 ? `${days} 天 ${clock}` : clock
}

/** ISO 串 → 剩余毫秒。解析不了返回 0（调用方据此显示「已结束」） */
export function remainingUntil(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0
  const at = Date.parse(iso)
  return Number.isNaN(at) ? 0 : at - now
}
