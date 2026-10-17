import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { NeedLoginError, getToken } from '@/api/client'
import { fetchMe, loginWithCode, logout as logoutRemote, logoutLocal } from '@/api/user'
import type { User } from '@/api/types'

/**
 * 登录态。**项目里的第一个 Pinia store**，也是唯一该用 store 的那一类东西。
 *
 * ── 什么时候用 store，什么时候继续用模块单例 ─────────────────────────────
 *
 * 项目里 `lib/lenis.ts` / `lib/intro.ts` / `lib/flip.ts` 都是**非反应式**的模块单例 ——
 * 它们持有的是瞬态对象（一个滚动实例、一个闸门标志、一批待转场的元素），谁都不需要在
 * 它们变化时重新渲染。登录态不一样：header 上的「登录 / 昵称」必须跟着变，这是纯粹的
 * 反应式需求，而跨组件的反应式共享状态正是 Pinia 的职责。
 *
 * 所以约定是：**需要驱动重渲染的跨组件状态 → store；只是被调用的能力 → 模块单例。**
 * 别因为「项目风格是模块单例」就手写一个 `ref` 挂在模块上 —— 那样 SSR/HMR 和 devtools
 * 都会退化，而 Pinia 已经把这三件事解决了。
 *
 * ── 为什么这里要有 `ready` ────────────────────────────────────────────────
 *
 * 刷新页面时 token 在 localStorage 里，但 `user` 要等一次 `/user/me` 才有值。中间这段
 * 时间里 `isLoggedIn` 是 false —— header 会先画一个「登录」再跳成昵称，看着像 bug。
 * `ready` 让 header 在恢复完成前保持占位，恢复完再决定画哪个。三行代码换掉一次闪烁。
 */

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  /** 首次恢复是否已完成。false 时 header 不该断言「未登录」 */
  const ready = ref(false)

  const isLoggedIn = computed(() => Boolean(user.value))

  /** 同一时刻只允许一次恢复（HMR / 重复调用不该打两次 `/user/me`） */
  let pending: Promise<void> | null = null

  /**
   * 启动时恢复登录态：有 token 就换用户信息。
   *
   * **只对 `NeedLoginError` 清 token。** 这一点是刻意的，也是最容易写错的地方：
   *
   *   * `NeedLoginError`（后端 401）→ token 真的失效了，清掉，回到未登录
   *   * 其它错误（网络断了、后端没起来、502）→ token **留着**，`user` 保持 null
   *
   * 反过来写（catch 一切就清 token）的后果是：后端重启的那几秒钟里打开页面，
   * 用户就被静默登出了 —— 而他手里的 token 其实还好好的。这类「因为报错所以删数据」
   * 是典型的越权善后。
   */
  async function restore(): Promise<void> {
    if (pending) return pending
    pending = (async () => {
      try {
        if (!getToken()) return
        user.value = await fetchMe()
      } catch (err) {
        if (err instanceof NeedLoginError) {
          logoutLocal()
          user.value = null
        }
        // 其它错误：不动 token，也不把 user 置空以外的处理 —— 下次进页面会再试
      } finally {
        ready.value = true
        pending = null
      }
    })()
    return pending
  }

  /**
   * 登录：`/user/login` 换 token → `/user/me` 换用户信息（两步都在 `loginWithCode` 里）。
   * 失败时把异常原样抛给页面，由页面决定怎么显示 —— store 不吞错、也不写 toast。
   */
  async function login(phone: string, code: string): Promise<User> {
    const me = await loginWithCode({ phone, code })
    user.value = me
    ready.value = true
    return me
  }

  /**
   * 登出：通知后端删 token → 清本地 → 清 store 状态。
   *
   * **失败也不回滚本地登出。** 网络断了的时候用户的诉求是「离开这台机器」，
   * 不是「保持登录直到服务器回复」。`api/user.ts` 的 `logout` 已经在 `finally`
   * 里清了 token，所以这里无论成功失败都要把 `user` 置空 —— 否则会出现
   * 「token 没了、header 还显示昵称」的撕裂状态。
   *
   * 服务端副本没删成功的后果有界：`LOGIN_USER_TTL` 是 30 分钟，
   * 且它只在 `RefreshTokenInterceptor` 续命时才有请求带上它。
   */
  async function logout(): Promise<void> {
    try {
      await logoutRemote()
    } catch {
      // 服务端删除失败不阻断本地登出，理由见上
    } finally {
      user.value = null
    }
  }

  /**
   * 用服务端返回的最新用户覆盖 store（改资料后调用）。
   *
   * 必须用**返回值**而不是本地拼一个 `{...user, nickName}`：后端可能对昵称
   * 做了 trim，头像也可能有服务端归一化。以写接口的响应为准。
   */
  function applyUser(next: User): void {
    user.value = next
  }

  /**
   * token 已失效时的本地清场，供 `main.ts` 注册的 401 处理器调用。
   *
   * **不碰 localStorage** —— 走到这里说明 `client.ts` 已经清过了。分开是为了让两边
   * 的职责单一：`client.ts` 管 token，store 管界面状态。重复清一遍不算错，但会让人
   * 以为 token 是 store 在管。
   */
  function forget(): void {
    user.value = null
    ready.value = true
  }

  return { user, ready, isLoggedIn, restore, login, logout, forget, applyUser }
})
