import { ApiError, USE_MOCK, get, put } from './client'
import {
  mockCommonFollows,
  mockFollow,
  mockIsFollowing,
  mockProfile,
} from './mockSocial'
import type { User, UserProfile } from './types'

/**
 * 车商 / 车评人主页与关注关系。
 *
 * ── 后端的三个事实（写在调用点之前，免得下一个人去猜）──────────────
 *
 * 1. `GET /user/profile/{id}` 是**公开**接口（白名单放行），只返回公开字段；
 *    手机号不在里面。
 * 2. `GET /follow/or/not/{id}`、`GET /follow/common/{id}` 是**需要登录**的 ——
 *    它们都读 `UserHolder`。未登录调用会拿到裸 401，所以主页只在登录后才请求它们，
 *    未登录时按钮显示「关注」并引导去登录，不把 401 当错误弹出来。
 * 3. `PUT /follow/{id}/{isFollow}` 的 `isFollow` 是**路径参数**，不是 body。
 *    后端的 `@PathVariable("isFollow") Boolean` 只认 `true` / `false` 两个字面量，
 *    传 `1` / `0` 会 400。
 */

function delay<T>(value: T, ms = 240): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/** GET /user/profile/{id} —— 昵称、头像、粉丝/关注/口碑三个计数 */
export async function fetchProfile(userId: number): Promise<UserProfile> {
  if (USE_MOCK) return delay(mockProfile(userId))
  return get<UserProfile>(`/user/profile/${userId}`)
}

/** GET /follow/or/not/{id} —— 我是否关注了对方（需登录） */
export async function isFollowing(userId: number): Promise<boolean> {
  if (USE_MOCK) return delay(mockIsFollowing(userId), 160)
  return Boolean(await get<boolean>(`/follow/or/not/${userId}`))
}

/** PUT /follow/{id}/{isFollow} —— 关注 / 取关（需登录） */
export async function setFollow(userId: number, follow: boolean): Promise<void> {
  if (USE_MOCK) return delay(mockFollow(userId, follow), 180)
  await put<void>(`/follow/${userId}/${follow}`)
}

/** GET /follow/common/{id} —— 共同关注（需登录） */
export async function fetchCommonFollows(userId: number): Promise<User[]> {
  if (USE_MOCK) return delay(mockCommonFollows(userId))
  return (await get<User[]>(`/follow/common/${userId}`)) ?? []
}

/**
 * 「关注自己」的判据。后端没有这条校验（`tb_follow` 无唯一索引，也不拦自己），
 * 所以**必须在前端拦住**：否则车商主页上的关注按钮能给自己加粉。
 */
export function isSelf(userId: number, myId: number | undefined): boolean {
  return myId != null && myId === userId
}

/** 关注失败时的统一文案 —— 真机返回的是 HTTP 错误，不是业务字面量 */
export function followErrorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : '操作失败，请稍后重试'
}
