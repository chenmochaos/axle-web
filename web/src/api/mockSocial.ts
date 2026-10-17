import { ApiError, NeedLoginError, getToken } from './client'
import { MOCK_TOKEN_PREFIX, localIso, mockReviews, mockUser } from './mock'
import type { FeedPage, Page, Review, ReviewInput, User, UserProfile } from './types'

/**
 * M4/M5 的 mock 社交后端。
 *
 * `mock.ts` 是**只读种子**（车、券、品牌、七条口碑），这里放**会变的社交状态**：
 * 点赞、关注、关注流、资料、签到。分成两个文件不是为了整洁，而是为了让
 * 「种子数据被就地改掉」这种 bug 不可能发生 —— 首页的 `fetchFeaturedCars` 等
 * 都直接读 `mockCars`，一个 `sort()` 就能把全站顺序悄悄改掉（那条教训写在 `car.ts`）。
 *
 * ── 与真机的对应关系 ─────────────────────────────────────────────────────
 *
 * 这里每一个函数都对应一段后端逻辑，**行为必须一致**，否则「同一页、两种数据源」
 * 的验收判据就失效了。三处最容易走偏的地方已经按后端写死：
 *
 * 1. **点赞**：`review:liked:{id}` 是 ZSET，值是时间戳；`liked` 计数在 MySQL。
 *    没点过 → +1 并记入集合；点过 → -1 并移出。同一个人重复点就是取消。
 * 2. **关注流**：score 是发布时间（毫秒），游标是 `(minTime, offset)`，
 *    同一毫秒的多条靠 offset 跳过 —— 见 `fetchFeed` 里与 `ReviewServiceImpl`
 *    逐行对应的游标计算。
 * 3. **签到**：Redis bitmap 的 bit 位是「本月第几天 - 1」，`signCount` 统计
 *    **从今天往前连续**的天数，不是本月总签到数。
 *
 * 已知缺口：全部状态只活在内存里，刷新页面即回到种子。真机路径没有这个问题。
 */

/** 与后端 `SystemConstants.DEFAULT_PAGE_SIZE` 一致 —— 关注流一页 5 条 */
export const FEED_PAGE_SIZE = 5
/** 与后端 `SystemConstants.MAX_PAGE_SIZE` 一致 —— 口碑列表一页 10 条 */
export const REVIEW_PAGE_SIZE = 10

/** 当前 mock 登录用户 */
const CURRENT_USER_ID = mockUser.id

/**
 * 所有能出现在 mock 社交数据里的人。
 *
 * 后续 id 与 `mockReviews[].author.id` 一一对应；没有它们，点赞榜和关注流
 * 就只能显示一个 id，页面看起来像没做完。
 */
const people: Record<number, User> = {
  [CURRENT_USER_ID]: mockUser,
  11: { id: 11, nickName: '老陈说车', icon: '' },
  12: { id: 12, nickName: 'Track Day', icon: '' },
  13: { id: 13, nickName: '弯道快才是真的快', icon: '' },
  14: { id: 14, nickName: '电量焦虑患者', icon: '' },
  15: { id: 15, nickName: '两个轮子', icon: '' },
  16: { id: 16, nickName: '摩托范儿', icon: '' },
  17: { id: 17, nickName: '第三方检测员', icon: '' },
}

/**
 * 关注关系。方向是 `userId` 关注 `followUserId` —— 与 `tb_follow` 一致。
 *
 * 种子里让 mock 用户关注 11 / 13 / 15，于是关注流里有口碑 1、3、5 三条，
 * 正好够展示「第一页不满、到底」和「同一作者多条」两种排版。
 */
const follows: { userId: number; followUserId: number }[] = [
  { userId: CURRENT_USER_ID, followUserId: 11 },
  { userId: CURRENT_USER_ID, followUserId: 13 },
  { userId: CURRENT_USER_ID, followUserId: 15 },
  { userId: 11, followUserId: CURRENT_USER_ID },
  { userId: 12, followUserId: CURRENT_USER_ID },
  { userId: 13, followUserId: CURRENT_USER_ID },
  { userId: 16, followUserId: CURRENT_USER_ID },
  { userId: 11, followUserId: 13 },
  { userId: 15, followUserId: 11 },
  { userId: 17, followUserId: 11 },
]

/**
 * 点赞集合，`reviewId → 按时间先后排的 userId`。
 *
 * 顺序就是后端 ZSET 的 score 顺序，点赞榜取前 5 靠它。
 * 计数（`liked`）不从这里推 —— 后端真实点赞数远大于 ZSET 里的人数（ZSET 只在
 * 点赞功能上线后才有数据），拿集合大小当计数会让 mock 与真机的数字差一个量级。
 */
const likers = new Map<number, number[]>([
  [1, [12, 13, 14, 15, 16]],
  [2, [11, 13, 14, 15]],
  [3, [11, 12, 14, 15, 16, 17]],
  [4, [11, 12, 13]],
  [5, [11, 13]],
  [6, [12, 13, 14]],
  [7, [11, 12, 13, 14, 15]],
])

/** 可变的口碑表。种子是浅拷贝 —— 就地改 mockReviews 会污染首页 */
const liveReviews: Review[] = mockReviews.map((r) => ({
  ...r,
  images: [...r.images],
  author: { ...r.author },
}))

/** 本月已签到的「日」（1–31）。后端是 bitmap，这里用 Set 表达同一件事 */
const signedDays = new Set<number>()

/* ── 工具 ──────────────────────────────────────────────────────────────── */

/** mock 模式下这个会话有没有登录 —— 判据与 `user.ts` 的 `fetchMe` 相同 */
export function mockIsLoggedIn(): boolean {
  return Boolean(getToken()?.startsWith(MOCK_TOKEN_PREFIX))
}

function requireLogin(): void {
  // 必须抛 `NeedLoginError`，不是普通 `ApiError`：真机 401 抛的是前者，
  // 页面靠 `instanceof NeedLoginError` 决定「跳登录」而不是「显示错误」。
  // mock 抛错类型不对，切到真机之前这条分支永远不会被发现。
  if (!mockIsLoggedIn()) throw new NeedLoginError()
}

/** 读接口统一出口：拷贝一份并补上「当前用户是否点过赞」 */
function withLike(review: Review): Review {
  return {
    ...review,
    images: [...review.images],
    author: { ...review.author },
    isLiked: likers.get(review.id)?.includes(CURRENT_USER_ID) ?? false,
  }
}

function byCreateTimeDesc(a: Review, b: Review): number {
  const ta = Date.parse(a.createTime)
  const tb = Date.parse(b.createTime)
  return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta) || b.id - a.id
}

function pageOf(list: Review[], current: number): Page<Review> {
  const start = (current - 1) * REVIEW_PAGE_SIZE
  const slice = list.slice(start, start + REVIEW_PAGE_SIZE)
  return {
    list: slice,
    total: list.length,
    current,
    hasMore: slice.length >= REVIEW_PAGE_SIZE,
  }
}

/* ── 口碑 ──────────────────────────────────────────────────────────────── */

/** `GET /review/hot` —— 后端按 `liked` 降序，不是按时间 */
export function mockHotReviews(current: number): Page<Review> {
  const list = [...liveReviews].sort((a, b) => b.liked - a.liked || b.id - a.id)
  return pageOf(list.map(withLike), current)
}

/** `GET /review/{id}` */
export function mockReviewById(id: number): Review | undefined {
  const found = liveReviews.find((r) => r.id === id)
  return found ? withLike(found) : undefined
}

/** `GET /review/of/user`、`/review/of/me` —— 按发布时间倒序 */
export function mockReviewsOfUser(userId: number, current: number): Page<Review> {
  const list = liveReviews.filter((r) => r.author.id === userId).sort(byCreateTimeDesc)
  return pageOf(list.map(withLike), current)
}

/** `GET /review/likes/{id}` —— 点赞榜前 5，未登录也能看 */
export function mockLikersOf(id: number): User[] {
  const ids = likers.get(id) ?? []
  return ids
    .slice(0, 5)
    .map((uid) => people[uid])
    .filter((u): u is User => Boolean(u))
    .map((u) => ({ ...u }))
}

/** `PUT /review/like/{id}` —— 点过就是取消，返回后由调用方重新拉详情或本地翻转 */
export function mockToggleLike(id: number): void {
  requireLogin()
  const review = liveReviews.find((r) => r.id === id)
  if (!review) throw new ApiError('博客不存在')

  const list = likers.get(id) ?? []
  const index = list.indexOf(CURRENT_USER_ID)
  if (index === -1) {
    list.push(CURRENT_USER_ID)
    review.liked += 1
  } else {
    list.splice(index, 1)
    review.liked = Math.max(0, review.liked - 1)
  }
  likers.set(id, list)
}

/**
 * `POST /review` —— 发布口碑，返回新 id。
 *
 * 后端在保存后把 id 推进每个粉丝的 `feed:{userId}` ZSET；mock 的这一侧不用做，
 * 因为关注流是按「被关注者发布的口碑」现算的，新口碑天然会出现。
 */
export function mockSaveReview(input: ReviewInput): number {
  requireLogin()
  if (!input.carId) throw new ApiError('请选择车源')
  if (!input.title.trim()) throw new ApiError('标题不能为空')
  if (!input.content.trim()) throw new ApiError('内容不能为空')

  const id = liveReviews.reduce((max, r) => Math.max(max, r.id), 0) + 1
  liveReviews.push({
    id,
    carId: input.carId,
    title: input.title.trim(),
    content: input.content.trim(),
    images: input.images ?? [],
    liked: 0,
    comments: 0,
    createTime: localIso(Date.now()),
    isLiked: false,
    author: { id: CURRENT_USER_ID, nickName: mockUser.nickName, icon: mockUser.icon },
  })
  return id
}

/**
 * `GET /review/of/follow` —— 关注流。
 *
 * 游标算法**逐行对应** `ReviewServiceImpl.queryReviewOfFollow`：
 * 取 `score <= max` 的前 5 条，返回本页最小 score 以及「本页里有多少条落在
 * 这个 score 上」。下一次调用用 `(minTime, offset)` 跳过已经读过的那几条 ——
 * 否则两条同一毫秒发布的口碑会跨页重复，或者被整段跳过。
 */
export function mockFeed(lastId: number, offset: number): FeedPage {
  requireLogin()
  const followed = new Set(
    follows.filter((f) => f.userId === CURRENT_USER_ID).map((f) => f.followUserId),
  )

  const entries = liveReviews
    .filter((r) => followed.has(r.author.id))
    .map((r) => ({ review: r, score: Date.parse(r.createTime) }))
    .filter((e) => Number.isFinite(e.score) && e.score <= lastId)
    .sort((a, b) => b.score - a.score || b.review.id - a.review.id)

  const page = entries.slice(offset, offset + FEED_PAGE_SIZE)

  let minTime = 0
  let sameScore = 1
  for (const entry of page) {
    if (entry.score === minTime) {
      sameScore += 1
    } else {
      minTime = entry.score
      sameScore = 1
    }
  }

  return {
    list: page.map((e) => withLike(e.review)),
    minTime,
    offset: sameScore,
    hasMore: page.length >= FEED_PAGE_SIZE,
  }
}

/* ── 用户 / 关注 ───────────────────────────────────────────────────────── */

/** `GET /user/profile/{id}` —— fans / followee / reviews 都是实时 count */
export function mockProfile(userId: number): UserProfile {
  const user = people[userId]
  if (!user) throw new ApiError('用户不存在')
  return {
    id: user.id,
    nickName: user.nickName,
    icon: user.icon,
    fans: follows.filter((f) => f.followUserId === userId).length,
    followee: follows.filter((f) => f.userId === userId).length,
    reviews: liveReviews.filter((r) => r.author.id === userId).length,
  }
}

/** `GET /follow/or/not/{id}` */
export function mockIsFollowing(userId: number): boolean {
  requireLogin()
  return follows.some((f) => f.userId === CURRENT_USER_ID && f.followUserId === userId)
}

/**
 * `PUT /follow/{id}/{isFollow}`。
 *
 * 真机后端对重复关注**不做唯一性校验**（`tb_follow` 没有唯一索引），这里多做一步
 * 「已经关注就不再加」：重复的 follow 行会把粉丝数算成两份，且取关时 `remove`
 * 会一并删掉，两种模式下数字就对不上了。前端按钮本身不会重复点，这层是兜底。
 */
export function mockFollow(userId: number, follow: boolean): void {
  requireLogin()
  if (userId === CURRENT_USER_ID) throw new ApiError('不能关注自己')

  const exists = follows.some(
    (f) => f.userId === CURRENT_USER_ID && f.followUserId === userId,
  )
  if (follow && !exists) {
    follows.push({ userId: CURRENT_USER_ID, followUserId: userId })
  } else if (!follow) {
    for (let i = follows.length - 1; i >= 0; i--) {
      if (follows[i].userId === CURRENT_USER_ID && follows[i].followUserId === userId) {
        follows.splice(i, 1)
      }
    }
  }
}

/** `GET /follow/common/{id}` —— 我和对方共同关注的人（真机走 Redis Set 交集） */
export function mockCommonFollows(userId: number): User[] {
  requireLogin()
  const mine = new Set(
    follows.filter((f) => f.userId === CURRENT_USER_ID).map((f) => f.followUserId),
  )
  const theirs = follows.filter((f) => f.userId === userId).map((f) => f.followUserId)
  return [...new Set(theirs)]
    .filter((id) => mine.has(id) && id !== CURRENT_USER_ID && id !== userId)
    .map((id) => people[id])
    .filter((u): u is User => Boolean(u))
    .map((u) => ({ ...u }))
}

/* ── 签到 ──────────────────────────────────────────────────────────────── */

/** `POST /user/sign` —— 幂等：同一天点两次不会变成两天 */
export function mockSign(): void {
  requireLogin()
  signedDays.add(new Date().getDate())
}

/**
 * `GET /user/sign/count` —— **从今天往前连续**的天数。
 *
 * 不是「本月签到总数」：签到 1 号和 15 号、中间断了，连续天数是 1 不是 2。
 * 今天没签但昨天签了，也返回 0（后端从今天的最低位开始数，第一位是 0 就停）。
 */
export function mockSignCount(): number {
  requireLogin()
  let count = 0
  for (let day = new Date().getDate(); day >= 1; day--) {
    if (!signedDays.has(day)) break
    count += 1
  }
  return count
}

/** `PUT /user/profile` —— 返回更新后的用户，并同步历史口碑上的作者副本 */
export function mockUpdateProfile(nickName: string, icon?: string): User {
  requireLogin()
  const trimmed = nickName.trim()
  if (!trimmed) throw new ApiError('昵称不能为空')
  if (trimmed.length > 32) throw new ApiError('昵称不能超过 32 个字符')

  mockUser.nickName = trimmed
  if (icon != null) mockUser.icon = icon

  for (const review of liveReviews) {
    if (review.author.id === CURRENT_USER_ID) {
      review.author.nickName = mockUser.nickName
      review.author.icon = mockUser.icon
    }
  }
  return { ...mockUser }
}
