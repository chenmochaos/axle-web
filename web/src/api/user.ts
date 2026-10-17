import {
  ApiError,
  NeedLoginError,
  USE_MOCK,
  clearToken,
  get,
  getToken,
  post,
  postParams,
  put,
  setToken,
} from './client'
import { MOCK_TOKEN_PREFIX, mockUser } from './mock'
import { mockSign, mockSignCount, mockUpdateProfile } from './mockSocial'
import type { LoginForm, User } from './types'

/**
 * 登录相关接口。
 *
 * ── 后端契约（2026-10-16 查实，与设计文档 §5 的三处出入都写在这里）────────
 *
 * 1. `POST /user/login` **只返回一个 token 字符串**（`Result.ok(token)`），
 *    不是用户对象。所以登录是**两步**：拿 token → `GET /user/me` 换用户信息。
 * 2. 未登录时后端返回**裸 401 + 空 body**，不是 `{"errorMsg":"请登录"}`。
 * 3. `POST /user/logout` 自 2026-10-17 起是**真的**了（删除 Redis 里的 token）。
 *    登出必须两边都做：先调接口让服务端副本失效，再清本地 —— 只清本地会让
 *    token 在 Redis 里活到 30 分钟 TTL 结束，而它仍然是一把能用的钥匙。
 *
 * 三条都会在真机模式下直接表现出来，所以这里的 mock 分支刻意**复刻同一套形状**：
 * mock 的 `loginWithCode` 也只返回 token，mock 的 `fetchMe` 也是独立一步。
 * 如果 mock 图省事在登录时直接返回用户对象，登录页就会写出「登录一次就拿到用户」
 * 的代码，切到真机立刻坏 —— 而 mock 存在的意义正是让这种事提前暴露。
 */

/** mock 验证码。与登录页的 dev 提示文案共用一份，改这里就够 */
export const MOCK_SMS_CODE = '123456'

/** mock 手机号 —— 任意合法手机号都能登，这个只是文档里举例用的 */
export const MOCK_PHONE = '13800000000'

// `MOCK_TOKEN_PREFIX` 从 `mock.ts` 引入 —— `mockSocial.ts` 也要用它判断登录态，
// 两边各写一份字面量，改前缀时会漏掉一处，表现为「mock 里点赞永远说请登录」。

function delay<T>(value: T, ms = 260): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/**
 * POST /user/code?phone=… —— 发验证码。
 *
 * ⚠️ **走 query 参数，不是 JSON body。** 后端签名是
 * `sendCode(@RequestParam("phone") String phone)`，传 body 会拿到 400 Bad Request
 * （curl 实测过）。同一个控制器里 `/login` 用的却是 `@RequestBody` —— 两个接口不一致，
 * 照抄相邻那个必错。所以这里用 `postParams` 而不是 `post`。
 *
 * 真机上验证码只 `log.debug` 到后端控制台，**没有短信网关**
 * （`UserServiceImpl:59-65`，码存 Redis 2 分钟）。真机模式下必须去后端日志里捞 ——
 * 登录页会在 `import.meta.env.DEV` 下提示这一点。
 */
export async function sendCode(phone: string): Promise<void> {
  if (USE_MOCK) return delay(undefined, 420)
  await postParams<void>('/user/code', { phone })
}

/**
 * 登录 → 拿 token → 换用户信息。**两步都在这里，调用方只管拿到 `User`。**
 *
 * 后端 `POST /user/login` 的响应体是 token 字符串本身（`Result.ok(token)`），
 * 所以 `post<string>` 取到的就是 token；紧接着必须 `GET /user/me`，
 * 否则拿不到 `{id, nickName, icon}`。
 *
 * 中途 `fetchMe` 失败时**把 token 也清掉**：一个换不到用户的 token 是废的，
 * 留着会让 `restore()` 在下次刷新时再失败一遍，表现为「每次打开都要登录两次」。
 */
export async function loginWithCode(form: LoginForm): Promise<User> {
  if (USE_MOCK) {
    if (form.code !== MOCK_SMS_CODE) {
      // 与后端的失败形状对齐：`Result.fail("验证码错误")` → success:false + errorMsg
      throw new ApiError('验证码错误')
    }
    await delay(undefined, 420)
    setToken(`${MOCK_TOKEN_PREFIX}${form.phone}`)
    return mockUser
  }

  const token = await post<string>('/user/login', form)
  setToken(token)
  try {
    return await fetchMe()
  } catch (err) {
    clearToken()
    throw err
  }
}

/** GET /user/me —— 用当前 token 换用户信息 */
export async function fetchMe(): Promise<User> {
  if (USE_MOCK) {
    await delay(undefined, 180)
    // 「有 token 才有我」—— 与后端同一形状：没 token 时这个接口就是 401。
    // 抛 `NeedLoginError` 而不是普通 `ApiError`，因为真机路径上它正是从
    // 拦截器的 401 分支抛出来的 —— 两条路径的异常类型必须一样，
    // 否则 `restore()` 里 `catch (NeedLoginError)` 只在一种模式下生效。
    if (!getToken()?.startsWith(MOCK_TOKEN_PREFIX)) throw new NeedLoginError()
    return mockUser
  }
  return get<User>('/user/me')
}

/**
 * 登出：**先通知后端删掉 Redis 里的 token，再清本地。**
 *
 * 顺序不能反。反过来写（先清本地）的话，`client.ts` 的请求拦截器就取不到 token，
 * 这次 `POST /user/logout` 会作为一个匿名请求发出去 —— 后端拿不到 `authorization`，
 * 删不掉任何东西，接口还照样返回成功。也就是「看起来登出了，钥匙还挂在门上」。
 *
 * 后端失败时**仍然清本地**并让异常抛出：网络断了也要让用户能离开这台机器，
 * 但必须让调用方知道服务端副本可能还在（30 分钟 TTL 后自然过期）。
 */
export async function logout(): Promise<void> {
  try {
    if (USE_MOCK) {
      await delay(undefined, 120)
    } else {
      await post<void>('/user/logout')
    }
  } finally {
    clearToken()
  }
}

/**
 * 本地登出，不碰服务端。只用于「后端明确说这个 token 无效」的场景
 * （`client.ts` 的 401 分支、`restore()` 的 `NeedLoginError`）——
 * 那些情况下服务端副本本来就已经没了，再发一次请求没有意义。
 */
export function logoutLocal(): void {
  clearToken()
}

/**
 * POST /user/sign —— 今日签到。幂等：同一天重复点不会变成两天。
 *
 * 后端用 Redis bitmap（`sign:{yyyy:MM:}{userId}`），bit 位是「本月第几天 - 1」。
 */
export async function signIn(): Promise<void> {
  if (USE_MOCK) return delay(mockSign(), 180)
  await post<void>('/user/sign')
}

/**
 * GET /user/sign/count —— **从今天往前连续**签到的天数。
 *
 * 不是本月签到总数：1 号和 15 号签过、中间断了，结果是 1。
 * 今天没签但昨天签了，结果是 0（后端从今天那一位开始数，第一位是 0 就停）。
 */
export async function fetchSignCount(): Promise<number> {
  if (USE_MOCK) return delay(mockSignCount(), 160)
  return (await get<number>('/user/sign/count')) ?? 0
}

/**
 * PUT /user/profile —— 修改昵称与头像，返回更新后的用户。
 *
 * 后端会同步刷新 Redis 里 `login:token:{token}` 那份用户快照，所以调用方
 * **必须把返回值写回 auth store**：否则刷新页面前，header 上还是旧昵称。
 */
export async function updateProfile(input: {
  nickName: string
  icon?: string
}): Promise<User> {
  if (USE_MOCK) return delay(mockUpdateProfile(input.nickName, input.icon), 260)
  return put<User>('/user/profile', input)
}
