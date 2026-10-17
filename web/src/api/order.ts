import { ApiError, NeedLoginError, USE_MOCK, getToken, post } from './client'
import { mockVouchers } from './mock'

/**
 * 秒杀下单。
 *
 * ── 后端契约（`VoucherOrderServiceImpl:171-198` + `seckill.lua`，2026-10-16 查实）──
 *
 * **只有三条失败信息，字面量就是下面这三个**，前端的分支必须照它们写：
 *
 *   * `库存不足`
 *   * `禁止重复下单`
 *   * `优惠券不存在或库存未预热`
 *
 * ⚠️ **不要写「秒杀尚未开始 / 已经结束」的处理分支。** 那两个字符串存在于后端
 * **被注释掉的同步实现**里，线上这条异步路径（Lua + Redis Stream）根本不校验时间窗。
 * 前端能看到的「时间窗」判据只有自己那份 `isSeckillLive()`（见 car.ts）。
 *
 * ⚠️ **返回的 `orderId` 此刻还没落库。** 请求只把消息投进 Redis Stream 就返回了，
 * 真正的建单由 `VoucherOrderServiceImpl` 的消费者线程去做。所以：
 *
 *   * 界面**不能**说「已购买成功」，只能说「下单请求已受理 / 订单正在生成」
 *   * 界面**不能**立刻去查订单 —— 后端也没有任何订单查询接口
 *
 * 这不是悲观措辞，是事实描述：把「已受理」说成「已成功」，用户会去个人中心找一个
 * 十分钟后才会出现的订单。
 */

/** 后端三条失败信息的字面量。导出给 spec 断言用，避免测试里再手抄一份 */
export const SECKILL_ERRORS = {
  soldOut: '库存不足',
  duplicated: '禁止重复下单',
  notWarmed: '优惠券不存在或库存未预热',
} as const

function delay<T>(value: T, ms = 420): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/* ── mock 的「服务端状态」──────────────────────────────────────────────────
 *
 * 这两张表是 mock 的一等公民，不是测试桩：没有它们，「一人一单」和「库存耗尽」
 * 这两条分支在默认（mock）模式下永远演不出来，而它们恰恰是秒杀功能最该被看到的部分。
 *
 * 存在**模块内存**里而不是 localStorage：真机下这两个状态在后端，刷新页面并不会
 * 让你的下单记录消失，但 mock 里让它跟着刷新重置反而更好用 —— 演示完一遍不用手动清。
 * 代价是「同一账号再抢一次被拒」在刷新后就不再成立，这一点在登录页的 dev 提示里说明。
 */
const orderedVouchers = new Set<string>()
const stockLeft = new Map<number, number>()

/** key 里带上用户，才是真正的「一人一单」—— 换个人应当能再抢一次 */
function orderKey(userId: string, voucherId: number): string {
  return `${userId}:${voucherId}`
}

/** 仅供测试重置 mock 服务端状态（真机路径没有对应物，所以不导出给业务代码用） */
export function __resetMockOrderState(): void {
  orderedVouchers.clear()
  stockLeft.clear()
}

/**
 * POST /voucher-order/seckill/{voucherId} —— 抢购。
 *
 * `voucherId` 是**券 id**，不是车 id。车 id 用来找到券（`fetchVouchersOfShop(carId)`），
 * 下单用的是券自己的 id —— 这两者在页面 URL 与请求体里同时出现，最容易混。
 *
 * ⚠️ **响应体的 `data` 是一个裸数字，不是对象。** 后端 `Result.ok(orderId)`
 * （`VoucherOrderServiceImpl:197`），所以 `post<number>` 才对；写成
 * `post<{orderId:number}>` 会拿到 `undefined`，而 TS 不会报错（泛型是断言不是校验）。
 * 这里包一层 `{orderId}` 是为了让调用方读起来明确，不是为了迁就后端。
 *
 * ⚠️ **屏幕上显示的订单号末几位和数据库里的不一样。** 不是「可能」，是必然 ——
 * 后端 `orderId` 是 `RedisIdWorker` 生成的 `long`（`时间戳 << 32 | 序列号`），
 * 量级 ~6.5e17，**远超 `Number.MAX_SAFE_INTEGER`（9.007e15）**，而 JSON 数字走
 * IEEE-754 双精度，`JSON.parse` 只能落到最近的、可表示的那个值上。
 *
 * 2026-10-16 实测到的那一对（同一次下单）：
 *
 * | 界面显示（JS 解析后）  | 数据库 `tb_voucher_order.id` |
 * |---|---|
 * | `649328518907297800` | `649328518907297796` |
 *
 * 差 4。**只在展示时无伤** —— 订单号不参与任何判断，页面也不拿它去查任何东西
 * （后端根本没有订单查询接口，这个坑今天踩不到）。但**不能**在它上面盖任何逻辑，
 * 比如「订单号相等 ⇒ 同一笔订单」。
 *
 * 根治要么后端把 long 序列化成字符串
 * （`@JsonSerialize(using = ToStringSerializer.class)`），要么前端用 BigInt 解析
 * 原始文本 —— 两者都超出 M3 范围，所以这里写明而不是假装没有。
 */
export async function seckill(voucherId: number): Promise<{ orderId: number }> {
  if (USE_MOCK) {
    await delay(undefined, 520)

    const token = getToken()
    // 后端这条路径在 LoginInterceptor 后面，未登录是裸 401。mock 复刻同一形状
    if (!token) throw new NeedLoginError()

    const voucher = mockVouchers.find((v) => v.id === voucherId)
    // 后端：「券不存在 / Redis 里没有库存 key」是同一条错误 —— 因为库存预热
    // （`init-seckill-stock.sh`）和建券是两步，中间有时间窗
    if (!voucher || voucher.type !== 1) throw new ApiError(SECKILL_ERRORS.notWarmed)

    const key = orderKey(token, voucherId)
    if (orderedVouchers.has(key)) throw new ApiError(SECKILL_ERRORS.duplicated)

    // 初始库存：第一次抢时把券的 stock 抄进 mock 的「库存表」，模拟 Redis 里的
    // `seckill:stock:{id}`
    const left = stockLeft.get(voucherId) ?? voucher.stock ?? 0
    if (left <= 0) throw new ApiError(SECKILL_ERRORS.soldOut)

    orderedVouchers.add(key)
    stockLeft.set(voucherId, left - 1)
    // 订单号：真机是 RedisIdWorker 的 `时间戳 << 32 | 序列号`（~1e18）。
    // 这里用同量级的假值，让它**看起来**和真机一样长 —— 界面上两种模式才不会一个
    // 18 位一个 13 位。它同样是「展示用，不参与判断」。
    return { orderId: (Date.now() - 1_600_000_000_000) * 4_194_304 + orderedVouchers.size }
  }

  // 裸数字，见上面的 ⚠️
  const orderId = await post<number>(`/voucher-order/seckill/${voucherId}`)
  return { orderId }
}

/**
 * 仅供 mock 演示「库存耗尽」用：把某张券的剩余库存设成 0。
 *
 * 存在的理由是这条分支否则**无法在界面上触达** —— 需要连抢 50 次才能看到「库存不足」。
 * 真机路径没有对应物（那要直接改 Redis）。
 */
export function __mockSetStock(voucherId: number, left: number): void {
  stockLeft.set(voucherId, left)
}
