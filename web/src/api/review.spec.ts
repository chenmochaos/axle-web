import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NeedLoginError, setToken } from './client'
import {
  fetchFollowFeed,
  fetchMyReviews,
  fetchReviewDetail,
  fetchReviewLikers,
  saveReview,
  toggleReviewLike,
} from './review'

/**
 * M4 口碑链路的用例。守三件在真机上会静默出错的事：
 *
 * 1. **点赞是开关，不是单向 +1。** 后端 `PUT /review/like/{id}` 点过就是取消，
 *    前端如果本地无脑 +1，第二次点击会把计数越点越高，而且永远不会报错。
 * 2. **关注流是游标分页。** `(lastId, offset)` 回传错一位的表现是翻页时重复或丢条目，
 *    页面看起来「正常加载」，只是内容不对。
 * 3. **未登录的动作抛 `NeedLoginError`。** 真机是裸 401，mock 必须同类型，
 *    否则 `catch (NeedLoginError)` 只在一种模式下生效。
 */

const TOKEN = 'mock-token-13800000000'

beforeEach(() => {
  setToken(TOKEN)
})

afterEach(() => {
  localStorage.clear()
})

describe('口碑详情与点赞', () => {
  it('详情保留 carId，作者字段已组装，不存在的 id 返回 undefined', async () => {
    const review = await fetchReviewDetail(1)
    expect(review?.carId).toBeGreaterThan(0)
    expect(review?.author.nickName).toBeTruthy()
    // 「博客不存在」是业务空态，不能变成抛错让页面进错误分支
    expect(await fetchReviewDetail(9999)).toBeUndefined()
  })

  it('点赞是开关：再点一次计数回到原值', async () => {
    const before = (await fetchReviewDetail(2))!
    expect(before.isLiked).toBe(false)

    await toggleReviewLike(2)
    const liked = (await fetchReviewDetail(2))!
    expect(liked.isLiked).toBe(true)
    expect(liked.liked).toBe(before.liked + 1)

    await toggleReviewLike(2)
    const back = (await fetchReviewDetail(2))!
    expect(back.isLiked).toBe(false)
    expect(back.liked).toBe(before.liked)
  })

  it('未登录点赞 → NeedLoginError（真机是裸 401）', async () => {
    localStorage.clear()
    await expect(toggleReviewLike(2)).rejects.toBeInstanceOf(NeedLoginError)
  })

  it('点赞榜最多 5 人', async () => {
    // 种子里的口碑 3 有 6 个点赞人 —— 接口只给前 5
    const people = await fetchReviewLikers(3)
    expect(people).toHaveLength(5)
    expect(people.every((u) => u.nickName)).toBe(true)
  })
})

describe('关注流 —— 游标翻页', () => {
  it('沿游标翻到底，不重复也不跳过', async () => {
    const seen = new Set<number>()
    let lastId = Date.now()
    let offset = 0

    for (let round = 0; round < 10; round++) {
      const page = await fetchFollowFeed(lastId, offset)
      for (const review of page.list) {
        // 同一毫秒多条口碑靠 offset 跳过，算错就是这里红
        expect(seen.has(review.id)).toBe(false)
        seen.add(review.id)
      }
      if (!page.hasMore || page.minTime <= 0) break
      lastId = page.minTime
      offset = page.offset
    }

    expect(seen.size).toBeGreaterThan(0)
  })

  it('未登录看关注流 → NeedLoginError', async () => {
    localStorage.clear()
    await expect(fetchFollowFeed(Date.now(), 0)).rejects.toBeInstanceOf(NeedLoginError)
  })
})

describe('发布口碑', () => {
  it('返回新 id，并立刻出现在「我的口碑」第一页', async () => {
    const id = await saveReview({ carId: 1, title: '测试标题', content: '测试内容' })
    expect(id).toBeGreaterThan(0)

    const detail = await fetchReviewDetail(id)
    expect(detail?.title).toBe('测试标题')
    expect(detail?.carId).toBe(1)

    const mine = await fetchMyReviews(1)
    expect(mine.list[0].id).toBe(id)
  })

  it('标题/内容为空时拒绝，且不落库', async () => {
    const before = (await fetchMyReviews(1)).list.length
    await expect(saveReview({ carId: 1, title: '  ', content: '内容' })).rejects.toThrow(
      '标题不能为空',
    )
    await expect(saveReview({ carId: 1, title: '标题', content: '' })).rejects.toThrow(
      '内容不能为空',
    )
    expect((await fetchMyReviews(1)).list).toHaveLength(before)
  })

  it('未登录发布 → NeedLoginError', async () => {
    localStorage.clear()
    await expect(saveReview({ carId: 1, title: 't', content: 'c' })).rejects.toBeInstanceOf(
      NeedLoginError,
    )
  })
})
