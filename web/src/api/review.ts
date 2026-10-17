import { ApiError, USE_MOCK, client, get, getPage, post, put } from './client'
import { reviewFromDTO } from './adapt'
import { mockFeed, mockLikersOf, mockReviewById, mockReviewsOfUser, mockSaveReview, mockToggleLike } from './mockSocial'
import type { ApiResult, FeedPage, Page, Review, ReviewDTO, ReviewInput, User } from './types'

/**
 * 口碑 / 关注流的接口层。
 *
 * ── 与后端对齐的四个契约（2026-10-17 查实）──────────────────────────────
 *
 * 1. **作者字段只有查询接口才有。** `Review` 实体的 `userId` 是真的列，
 *    `name` / `icon` 是 `@TableField(exist = false)`，由 Service 层 JOIN 后填。
 *    所以 `POST /review` 之后别指望拿回作者信息 —— 后端只回新 id。
 * 2. **未登录时 `isLike` 字段缺失。** `isReviewLiked` 在 `UserHolder` 为空时直接 return。
 *    适配层把它归一成 `false`，页面按「没点过」渲染（点下去会先跳登录）。
 * 3. **关注流是游标分页，不是页码。** 入参 `lastId`（毫秒时间戳）+ `offset`，
 *    出参 `minTime` + `offset` 原样回传。用页码调它只会拿到底部那几条。
 * 4. **空流返回 `data: null`** —— 后端 `Result.ok()` 单参重载，不是空数组。
 *
 * 真机与 mock 的行为逐条对齐；mock 的实现在 `mockSocial.ts`，那里写明了每一处
 * 对应哪段后端逻辑。
 */

function delay<T>(value: T, ms = 260): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/**
 * GET /review/{id}
 *
 * 后端只有「口碑不存在」这一种业务失败会返回 `博客不存在`，其余错误（超时、5xx）
 * 必须继续抛 —— 把故障吞成空态，表现就是「后端挂了，页面说这篇口碑不存在」。
 */
export async function fetchReviewDetail(id: number): Promise<Review | undefined> {
  if (USE_MOCK) return delay(mockReviewById(id))
  try {
    return reviewFromDTO(await get<ReviewDTO>(`/review/${id}`))
  } catch (err) {
    if (err instanceof ApiError && err.message === '博客不存在') return undefined
    throw err
  }
}

/** GET /review/likes/{id} —— 点赞榜前 5，公开接口 */
export async function fetchReviewLikers(id: number): Promise<User[]> {
  if (USE_MOCK) return delay(mockLikersOf(id))
  return (await get<User[]>(`/review/likes/${id}`)) ?? []
}

/**
 * PUT /review/like/{id} —— 点过就是取消，后端返回空 data。
 *
 * 因此**不能**从这个接口读新计数或新状态，只能由调用方本地翻转，
 * 或像详情页那样在成功后重新拉一次详情。这里选后者：计数以服务端为准。
 */
export async function toggleReviewLike(id: number): Promise<void> {
  if (USE_MOCK) return delay(mockToggleLike(id), 180)
  await put<void>(`/review/like/${id}`)
}

/** GET /review/of/me —— 当前登录用户发布的口碑 */
export async function fetchMyReviews(current = 1): Promise<Page<Review>> {
  if (USE_MOCK) return delay(mockReviewsOfUser(1, current))
  const { list } = await getPage<ReviewDTO>('/review/of/me', { current })
  const reviews = list.map(reviewFromDTO)
  return { list: reviews, total: reviews.length, current, hasMore: reviews.length >= 10 }
}

/** GET /review/of/user?id= —— 某个作者的口碑（公开） */
export async function fetchReviewsOfUser(userId: number, current = 1): Promise<Page<Review>> {
  if (USE_MOCK) return delay(mockReviewsOfUser(userId, current))
  const { list } = await getPage<ReviewDTO>('/review/of/user', { id: userId, current })
  const reviews = list.map(reviewFromDTO)
  return { list: reviews, total: reviews.length, current, hasMore: reviews.length >= 10 }
}

/**
 * GET /review/of/follow —— 关注流（需登录）。
 *
 * `lastId` 首次传 `Date.now()`（后端拿它当 `max` score），之后传上一页的 `minTime`。
 * 空流时后端返回 `data: null`，这里归一成空页。
 */
export async function fetchFollowFeed(lastId: number, offset = 0): Promise<FeedPage> {
  if (USE_MOCK) return delay(mockFeed(lastId, offset), 320)

  const res = await client.get<ApiResult<{ list: ReviewDTO[]; minTime: number; offset: number } | null>>(
    '/review/of/follow',
    { params: { lastId, offset } },
  )
  const body = res.data.data
  const list = (body?.list ?? []).map(reviewFromDTO)
  return {
    list,
    minTime: body?.minTime ?? 0,
    offset: body?.offset ?? 0,
    // 后端页大小是 `SystemConstants.DEFAULT_PAGE_SIZE` = 5
    hasMore: list.length >= 5,
  }
}

/**
 * POST /review —— 发布口碑，返回新 id。
 *
 * `images` 在展示模型里是数组，后端列是逗号串 —— 这层拼接**只发生在这里**，
 * 和 `adapt.ts` 的反向拆分是同一件事的两半。
 */
export async function saveReview(input: ReviewInput): Promise<number> {
  if (USE_MOCK) return delay(mockSaveReview(input), 320)
  return post<number>('/review', {
    carId: input.carId,
    title: input.title,
    content: input.content,
    images: (input.images ?? []).join(','),
  })
}

/**
 * POST /upload/review —— 上传一张口碑配图，返回可访问的 URL。
 *
 * 后端把文件落在 `server/src/main/resources/static/imgs`，对外暴露为 `/imgs/**`；
 * 开发时 Vite 的 `/imgs` 代理把它转到 8081（见 `vite.config.ts`）。
 *
 * mock 分支用 data URL：不产生网络请求，但在本次会话里能直接预览。
 * 刷新后图片消失 —— 这是 mock 的已知边界，真机路径没有。
 */
export async function uploadReviewImage(file: File): Promise<string> {
  if (USE_MOCK) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new ApiError('图片读取失败'))
      reader.readAsDataURL(file)
    })
  }

  const form = new FormData()
  form.append('file', file)
  const res = await client.post<ApiResult<string>>('/upload/review', form)
  return res.data.data
}
