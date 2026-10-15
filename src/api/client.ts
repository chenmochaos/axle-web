import axios, { AxiosError, type AxiosInstance } from 'axios'
import type { ApiResult } from './types'

const TOKEN_KEY = 'hmdp_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // 隐私模式下 localStorage 可能直接抛异常
    return null
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* 存不进去就退化成当次会话内存态，不阻断流程 */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
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

export const client: AxiosInstance = axios.create({
  baseURL: '/api',
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
      if (msg === '请登录') {
        clearToken()
        return Promise.reject(new NeedLoginError())
      }
      return Promise.reject(new ApiError(msg, body))
    }

    return res
  },
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      clearToken()
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

/** 带 total 的分页接口 */
export async function getPage<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<{ list: T[]; total: number }> {
  const res = await client.get<ApiResult<T[]>>(url, { params })
  return { list: res.data.data ?? [], total: res.data.total ?? 0 }
}
