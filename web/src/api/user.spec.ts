import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ApiError, NeedLoginError, getToken, setToken } from './client'
import {
  MOCK_PHONE,
  MOCK_SMS_CODE,
  fetchMe,
  loginWithCode,
  logoutLocal,
  sendCode,
} from './user'
import { mockUser } from './mock'

/**
 * 登录链路的用例。守的是三条**已经在真机上踩过**的契约：
 *
 * 1. `POST /user/code` 走 **query 参数**，`POST /user/login` 走 **JSON body**。
 *    同一个控制器里两个 POST 注解不一致，照抄相邻那个就是 400 Bad Request ——
 *    而且 400 的响应体是 Spring 默认错误 JSON，看不出「参数位置错了」。
 * 2. 登录是**两步**：`/user/login` 只给 token，用户信息得再打 `/user/me`。
 * 3. 未登录是 `NeedLoginError`，在 mock 和真机两条路径上**类型一致** ——
 *    否则 `catch (NeedLoginError)` 只在一种模式下生效。
 *
 * 第 1、2 条只能靠读后端源码来守（它们是注解，不是返回值），所以最后那组用例
 * 直接扫 Java 源码。读不到后端时跳过而非失败：单独 checkout 前端不该红一片。
 */

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('sendCode', () => {
  it('mock 模式下直接成功（不依赖后端）', async () => {
    await expect(sendCode(MOCK_PHONE)).resolves.toBeUndefined()
  })

  it('返回 void —— 调用方拿不到验证码，真机上它只在后端日志里', async () => {
    // 这条不是废话：如果哪天有人让它返回验证码好写「自动填充」，
    // 真机上会拿到 undefined，而 mock 下能跑通 —— 正是要避免的那种假绿。
    expect(await sendCode(MOCK_PHONE)).toBeUndefined()
  })
})

describe('loginWithCode', () => {
  it('验证码正确 → 返回用户，并把 token 落进 localStorage', async () => {
    const user = await loginWithCode({ phone: MOCK_PHONE, code: MOCK_SMS_CODE })
    expect(user).toEqual(mockUser)
    expect(getToken()).toBe(`mock-token-${MOCK_PHONE}`)
  })

  it('验证码错误 → ApiError，且**不写入 token**', async () => {
    await expect(
      loginWithCode({ phone: MOCK_PHONE, code: '000000' }),
    ).rejects.toThrow('验证码错误')
    // 失败了还留着上一个 token，界面就会表现成「登录失败但已经是登录态」
    expect(getToken()).toBeNull()
  })

  it('登录写下的 token 是 fetchMe 认的（两个函数之间的往返）', async () => {
    // 分开测各自能过，接在一起却不认 —— 这类断裂只有往返一次才暴露
    await loginWithCode({ phone: MOCK_PHONE, code: MOCK_SMS_CODE })
    await expect(fetchMe()).resolves.toEqual(mockUser)
  })

  it('任意合法手机号都能登（mock 不绑死某个号）', async () => {
    const user = await loginWithCode({ phone: '13911112222', code: MOCK_SMS_CODE })
    expect(user).toEqual(mockUser)
    expect(getToken()).toContain('13911112222')
  })
})

describe('fetchMe', () => {
  it('没有 token → NeedLoginError（真机是裸 401）', async () => {
    await expect(fetchMe()).rejects.toBeInstanceOf(NeedLoginError)
  })

  it('token 不是 mock 发的 → NeedLoginError', async () => {
    // 真机上「Redis 里的 token 过期了」就是这个形状：本地还留着字符串，后端不认了。
    // mock 必须同样表现，否则「token 失效」这条分支在默认模式下永远走不到。
    setToken('一个真机上拿到的真 token')
    await expect(fetchMe()).rejects.toBeInstanceOf(NeedLoginError)
  })

  it('NeedLoginError 是 ApiError 的子类 —— 界面可以用一个 catch 兜住', async () => {
    await expect(fetchMe()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('logoutLocal', () => {
  it('清掉 token，之后 fetchMe 就失败了', async () => {
    await loginWithCode({ phone: MOCK_PHONE, code: MOCK_SMS_CODE })
    logoutLocal()
    expect(getToken()).toBeNull()
    await expect(fetchMe()).rejects.toBeInstanceOf(NeedLoginError)
  })

  it('没有 token 时调用也不报错（幂等）', () => {
    expect(() => logoutLocal()).not.toThrow()
  })
})

/* ── 同仓库跨目录契约：注解与字面量只能靠读后端源码来守 ─────────────────── */

// 前端与后端现在是同一个仓库的兄弟目录，这条路径**不可能缺失**。
// 早先这里写的是 `describe.skipIf(...)` —— 那条跳过分支已经删掉：文件缺失应当让测试
// 红掉，而不是安静地少跑一组断言。
const BACKEND = resolve(process.cwd(), '../server/src/main/java/com/axle')
const controllerPath = resolve(BACKEND, 'controller/UserController.java')
const servicePath = resolve(BACKEND, 'service/impl/UserServiceImpl.java')

describe('与后端源码对契约', () => {
  const controller = readFileSync(controllerPath, 'utf8')
  const service = readFileSync(servicePath, 'utf8')

  it('/user/code 收 query 参数，/user/login 收 JSON body', () => {
    // 这两行是本文件存在的首要理由。它俩要是反了，前端 400 而错误信息毫无提示。
    expect(controller).toContain('sendCode(@RequestParam("phone") String phone')
    expect(controller).toContain('login(@RequestBody LoginFormDTO loginForm')
  })

  it('失败信息字面量与后端一致', () => {
    expect(service).toContain('Result.fail("验证码错误")')
    expect(service).toContain('Result.fail("手机号格式错误")')
  })

  it('未登录是裸 401（只调 setStatus，不写 body）—— 所以判据只能是 HTTP 状态码', () => {
    const interceptor = readFileSync(resolve(BACKEND, 'interceptor/LoginInterceptor.java'), 'utf8')
    expect(interceptor).toContain('response.setStatus(401)')
    // 没有 write / getWriter，确认响应体是空的
    expect(interceptor).not.toMatch(/getWriter|writeValue/)
  })

  it('/user/logout 仍是「功能未完成」—— 前端不能调它', () => {
    // 哪天后端实现了真登出，这条会红，提醒把 logoutLocal 换成真调用
    const logout = controller.slice(controller.indexOf('public Result logout()'))
    expect(logout.slice(0, logout.indexOf('\n    }'))).toContain('功能未完成')
  })
})
