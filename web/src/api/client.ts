import axios, { AxiosError, type AxiosInstance } from 'axios'
import type { ApiResult } from './types'

const TOKEN_KEY = 'axle_token'

/**
 * 改名前的旧 key。**只用于一次性迁移，不是第二份存储。**
 *
 * 项目从 hmdp 改名到 AXLE 时，浏览器里可能还躺着旧 token。不迁移的话
 * 所有已登录用户会静默掉线（没有任何报错，只是下一次请求变成 401）。
 * 读到旧值就搬到新 key 并删掉旧 key —— 迁移只发生一次，之后旧 key 不复存在。
 */
const LEGACY_TOKEN_KEY = 'hmdp_token'

/**
 * 是否走 mock 数据源。**全站唯一一处读 `VITE_USE_MOCK` 的地方。**
 *
 * 曾经 `car.ts` / `user.ts` / `order.ts` 各写了一份同样的 `import.meta.env` 判断 ——
 * 三份同义的常量，改一处忘两处就会变成「列表走真机、下单走 mock」这种最难查的错位。
 * 各模块从自己那边 re-export 一次，调用方的 import 路径因此不用改。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

export function getToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) return token

    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY)
    if (legacy) {
      localStorage.setItem(TOKEN_KEY, legacy)
      localStorage.removeItem(LEGACY_TOKEN_KEY)
      return legacy
    }
    return null
  } catch {
    // 隐私模式下 localStorage 可能直接抛异常
    return null
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  } catch {
    /* 存不进去就退化成当次会话内存态，不阻断流程 */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  } catch {
    /* 同上 */
  }
}

/** 后端业务失败（HTTP 200 但 success:false） */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly raw?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 需要登录时抛这个，路由层统一弹登录而不是到处判断 */
export class NeedLoginError extends ApiError {
  constructor() {
    super('请登录')
    this.name = 'NeedLoginError'
  }
}

/**
 * 未登录时的统一回调，由 `main.ts` 注入（跳登录页并带上 `next`）。
 *
 * **为什么不直接在 `client.ts` 里 import router**：router → views → api → router 会成环。
 * 环在 ESM 里的表现是「某个模块拿到的是半初始化的导出」，错误现场离原因很远。
 * 注入一个回调是最便宜的解法，代价只是 `main.ts` 必须记得注册。
 *
 * ⚠️ 注入的实现**必须自己防重入**：它内部跳路由会触发新页面的请求，那些请求若也 401
 * 就会再调一次回调 —— 于是「跳转 → 401 → 跳转 → 401」。`main.ts` 那边用
 * 「已经在登录页就不再跳」来断环。这个责任放在注入方，因为 client 不知道路由长什么样。
 */
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn
}

/**
 * 确认「这次失败是因为没登录」时的统一善后：清掉本地 token + 通知路由层。
 *
 * 清 token 是必须的：留着它会让每个请求都带上一个后端已不认的 token，
 * 于是「登录过期」表现为「页面一直在转圈」而不是「跳登录」。
 */
function handleUnauthorized(): void {
  clearToken()
  unauthorizedHandler?.()
}

/**
 * 接口前缀。
 *
 * - 开发（`pnpm dev`）：`/api`，由 Vite 代理剥掉前缀后转发到后端 8081。
 * - 单 jar（`pnpm build:embed` + `mvn package`）：设为**空串**，直接打到同源的
 *   后端根路径（后端控制器没有 `/api` 前缀）。
 *
 * 用 `??` 而不是 `||`：空串是一个有意义的配置值。
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export const client: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 10_000,
})

client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    // ⚠️ header 名必须全小写 —— 后端 RefreshTokenInterceptor 读的就是 `authorization`
    config.headers.set('authorization', token)
  }
  return config
})

client.interceptors.response.use(
  (res) => {
    const body = res.data as ApiResult<unknown> | undefined

    if (body && typeof body === 'object' && body.success === false) {
      const msg = body.errorMsg ?? '请求失败'
      // ⚠️ **这条分支是防御性的，不是主路径。** 后端未登录时返回的是**裸 HTTP 401 +
      // 空 body**（`LoginInterceptor` 只 `setStatus(401)`，不写 JSON），所以真正生效的
      // 判据是下面 axios 错误分支里的 `status === 401`。这里判字符串 `请登录` 是为了
      // 万一后端哪天改成 200 + `{"errorMsg":"请登录"}` 的形态。
      //
      // 订正一条曾经写在这里的事实：原文说「全仓库 grep `请登录` 在 Java 侧零命中」，
      // 那是错的 —— `config/MvcConfig.java:40` 有一处，在一段注释里。所以更准确的说法是
      // **没有任何 Java 代码会返回它**（注释不参与运行），这条分支今天走不到。
      if (msg === '请登录') {
        handleUnauthorized()
        return Promise.reject(new NeedLoginError())
      }
      return Promise.reject(new ApiError(msg, body))
    }

    return res
  },
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      handleUnauthorized()
      return Promise.reject(new NeedLoginError())
    }
    return Promise.reject(new ApiError(err.message || '网络异常', err))
  },
)

/** 取 data 字段的便捷包装，绝大多数接口只关心 data */
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await client.get<ApiResult<T>>(url, { params })
  return res.data.data
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await client.post<ApiResult<T>>(url, body)
  return res.data.data
}

/**
 * POST + **query 参数**。
 *
 * 需要它是因为后端不是每个 POST 都用 `@RequestBody`：
 * `POST /user/code` 的签名是 `sendCode(@RequestParam("phone") String phone)` ——
 * 传 JSON body 会得到 **400 Bad Request**（Spring 找不到 `phone` 参数），
 * 而 400 的响应体是一段 Spring 默认错误 JSON，看不出「参数位置错了」这层意思。
 *
 * 2026-10-16 用 curl 逐个核对过：`/user/code` 走 query，`/user/login` 走 body。
 * 新增接口时先看一眼控制器的注解，别照抄相邻那个。
 */
export async function postParams<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await client.post<ApiResult<T>>(url, undefined, { params })
  return res.data.data
}

/** 带 total 的分页接口 */
export async function getPage<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<{ list: T[]; total: number }> {
  const res = await client.get<ApiResult<T[]>>(url, { params })
  return { list: res.data.data ?? [], total: res.data.total ?? 0 }
}
