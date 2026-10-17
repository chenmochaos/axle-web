import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * 「这一页要先登录」的统一入口。
 *
 * ── 为什么是一个返回函数的 composable，而不是路由守卫 ────────────────────
 *
 * 路由守卫在 `router/index.ts` 里写得下，但它拿不到页面级的「登录后回来做什么」：
 * 本项目的 `next` 是**当前完整路径**，而守卫里拼的也是 `to.fullPath` —— 差别不大。
 * 真正的理由是**时序**：`main.ts` 的 `restore()` 是刻意不 await 的，守卫跑在
 * 恢复完成之前，会把一个刚刷新、token 还在的已登录用户误判成未登录。
 * 页面在 `onMounted` 里等 `restore()` 完成再判断，才不会误伤。
 *
 * 用法：
 *
 * ```ts
 * const { ensure } = useRequireLogin()
 * onMounted(async () => {
 *   if (!(await ensure())) return   // 已经在去登录页的路上
 *   await load()
 * })
 * ```
 *
 * 返回 `false` 时页面**不应该再发数据请求** —— 那样会拿一遍 401，
 * 把「跳登录」变成「跳登录 + 一串失败请求」。
 */
export function useRequireLogin() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  async function ensure(): Promise<boolean> {
    if (!auth.ready) await auth.restore()
    if (auth.isLoggedIn) return true

    // `next` 用当前完整路径（含 query）。登录页只接受站内路径，
    // 这里传的是 router 自己产出的值，不存在开放重定向问题。
    await router.replace({ name: 'login', query: { next: route.fullPath } })
    return false
  }

  return { ensure, auth }
}
