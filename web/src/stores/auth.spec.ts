import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getToken, setToken } from '@/api/client'
import { fetchMe } from '@/api/user'
import { mockUser } from '@/api/mock'
import { useAuthStore } from './auth'

/**
 * 登录态 store 的用例。
 *
 * 只测**这里独有**的逻辑 —— 也就是 `restore()` 那两个分支的区别：
 * 后端说「你没登录」要清 token，网络说「我连不上」不能清。其余部分（换 token、发验证码）
 * 已经在 `api/user.spec.ts` 里测过，在这里再测一遍只是重复。
 *
 * 为此把 `@/api/user` 的 `fetchMe` 包了一层 spy，好让它按用例抛出指定的错误。
 */

vi.mock('@/api/user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/user')>()
  return { ...actual, fetchMe: vi.fn(actual.fetchMe) }
})

const MOCK_TOKEN = 'mock-token-13800000000'

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchMe).mockClear()
  setActivePinia(createPinia())
})

describe('useAuthStore', () => {
  it('初始未登录、且未 ready', () => {
    const auth = useAuthStore()
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.user).toBeNull()
    // ready 是 false —— header 靠它避免「先画登录按钮、再跳成昵称」的闪烁
    expect(auth.ready).toBe(false)
  })

  it('没有 token 时 restore() 不发请求，直接 ready', async () => {
    const auth = useAuthStore()
    await auth.restore()
    expect(fetchMe).not.toHaveBeenCalled()
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.ready).toBe(true)
  })

  it('有合法 token → 恢复出用户', async () => {
    setToken(MOCK_TOKEN)
    const auth = useAuthStore()
    await auth.restore()
    expect(auth.user).toEqual(mockUser)
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.ready).toBe(true)
  })

  it('token 已失效（后端 401）→ 清掉 token，回到未登录', async () => {
    setToken('一个后端不认的陈旧 token')
    const auth = useAuthStore()
    await auth.restore()
    expect(getToken()).toBeNull()
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.ready).toBe(true)
  })

  /**
   * 这条是整个文件里最该存在的一条：**网络故障不能导致登出。**
   *
   * 把 `catch` 写成「出任何错就清 token」的后果是 —— 后端重启的那几秒里打开页面，
   * 用户被静默登出，而他手里的 token 其实完全有效。
   */
  it('网络故障（非 401）→ **保留** token，只是这次没恢复出用户', async () => {
    setToken(MOCK_TOKEN)
    vi.mocked(fetchMe).mockRejectedValueOnce(new ApiError('Network Error'))

    const auth = useAuthStore()
    await auth.restore()

    expect(getToken()).toBe(MOCK_TOKEN)
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.ready).toBe(true)
  })

  it('并发调用 restore() 只打一次 /user/me', async () => {
    setToken(MOCK_TOKEN)
    const auth = useAuthStore()
    await Promise.all([auth.restore(), auth.restore(), auth.restore()])
    expect(vi.mocked(fetchMe).mock.calls.length).toBe(1)
    expect(auth.isLoggedIn).toBe(true)
  })

  it('恢复完成后再调 restore() 会重新取（不是永远只跑一次）', async () => {
    setToken(MOCK_TOKEN)
    const auth = useAuthStore()
    await auth.restore()
    await auth.restore()
    expect(vi.mocked(fetchMe).mock.calls.length).toBe(2)
  })

  it('login() 写入用户与 token', async () => {
    const auth = useAuthStore()
    const user = await auth.login('13800000000', '123456')
    expect(user).toEqual(mockUser)
    expect(auth.user).toEqual(mockUser)
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.ready).toBe(true)
    expect(getToken()).not.toBeNull()
  })

  it('login() 失败时抛给调用方，且不留下半个登录态', async () => {
    const auth = useAuthStore()
    await expect(auth.login('13800000000', '000000')).rejects.toThrow('验证码错误')
    expect(auth.isLoggedIn).toBe(false)
  })

  it('logout() 清 token 与用户（异步：先通知后端再清本地）', async () => {
    const auth = useAuthStore()
    await auth.login('13800000000', '123456')
    // 现在是异步的：服务端删 token 失败也必须清本地，否则用户会卡在「登不出去」。
    // mock 分支会 delay 一小段，所以调用方必须 await —— 不 await 时下面的断言会早于清理。
    await auth.logout()
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.user).toBeNull()
    expect(getToken()).toBeNull()
  })

  it('forget() 只清界面状态，不碰 localStorage', async () => {
    const auth = useAuthStore()
    await auth.login('13800000000', '123456')
    const tokenBefore = getToken()

    auth.forget()

    expect(auth.isLoggedIn).toBe(false)
    // token 的清理是 client.ts 的责任（它已经清过了），store 不重复管
    expect(getToken()).toBe(tokenBefore)
  })
})
