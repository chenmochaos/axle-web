import {
  ApiError,
  NeedLoginError,
  USE_MOCK,
  clearToken,
  get,
  getToken,
  post,
  postParams,
  setToken,
} from './client'
import { mockUser } from './mock'
import type { LoginForm, User } from './types'

/**
 * 登录相关接口。
 *
 * ── 后端契约（2026-10-16 查实，与设计文档 §5 的三处出入都写在这里）────────
 *
 * 1. `POST /user/login` **只返回一个 token 字符串**（`Result.ok(token)`），
 *    不是用户对象。所以登录是**两步**：拿 token → `GET /user/me` 换用户信息。
 * 2. 未登录时后端返回**裸 401 + 空 body**，不是 `{"errorMsg":"请登录"}`。
 * 3. `POST /user/logout` 是 `init` 分支里 5 处 `Result.fail("功能未完成")` 之一 ——
 *    **不能调**。登出只能前端清 token，后端那边 token 会留到 Redis 里自然过期。
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

/** mock 路径的「谁登录了」：只要 token 在，登录的就是这个人 */
const MOCK_TOKEN_PREFIX = 'mock-token-'

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
 * 登出。**只清本地，不调后端** —— `/user/logout` 是 `功能未完成` 的占位接口，
 * 调它只会拿到一个 `Result.fail`。后端的 token 留在 Redis 里自然过期
 * （`LOGIN_USER_TTL = 30 分钟`，`RefreshTokenInterceptor` 每次请求续命）。
 *
 * 这是个明确的功能缺口而不是选择：真登出需要后端实现黑名单。写在这里，
 * 免得下一个人以为「清了本地就等于登出了」。
 */
export function logoutLocal(): void {
  clearToken()
}
