import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ApiError, NeedLoginError, setToken } from './client'
import {
  SECKILL_ERRORS,
  __mockSetStock,
  __resetMockOrderState,
  seckill,
} from './order'
import { mockVouchers } from './mock'

/**
 * 秒杀下单的用例。守的是三件事：
 *
 * 1. **三条错误信息的字面量**。前端要按后端的字符串分支，抄错一个字就是
 *    「后端明明拒绝了，界面却当成成功」。所以最后那组用例**直接读后端源码**来对，
 *    而不是把字符串再手抄一遍（手抄等于把同一个错误犯两次）。
 * 2. **一人一单**。这是秒杀最该被演示出来的分支，mock 必须在内存里真的记住。
 * 3. **未登录是 `NeedLoginError`**。真机路径上它由拦截器的裸 401 抛出，
 *    类型必须一致，否则 `catch (NeedLoginError)` 只在一种模式下生效。
 */

const LIVE_SECKILL_VOUCHER = 101 // 车 5，stock 50
const NORMAL_VOUCHER = 102 // 车 5，type = 0

beforeEach(() => {
  __resetMockOrderState()
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('seckill —— mock 服务端行为', () => {
  it('未登录 → NeedLoginError（真机是裸 401）', async () => {
    await expect(seckill(LIVE_SECKILL_VOUCHER)).rejects.toBeInstanceOf(NeedLoginError)
  })

  it('登录后抢得到，返回一个订单号', async () => {
    setToken('mock-token-13800000000')
    const { orderId } = await seckill(LIVE_SECKILL_VOUCHER)
    expect(typeof orderId).toBe('number')
    expect(orderId).toBeGreaterThan(0)
  })

  it('同一账号再抢一次 → 禁止重复下单（一人一单）', async () => {
    setToken('mock-token-13800000000')
    await seckill(LIVE_SECKILL_VOUCHER)
    // 这条分支在界面上是「你已经抢到过这张券了」，必须能真的演出来 ——
    // 所以 mock 把已下单的券记在模块内存里，不是每次都放行。
    await expect(seckill(LIVE_SECKILL_VOUCHER)).rejects.toThrow('禁止重复下单')
  })

  it('一人一单是**按人**的，换个账号还能抢', async () => {
    setToken('mock-token-13800000000')
    await seckill(LIVE_SECKILL_VOUCHER)
    setToken('mock-token-13900000000')
    await expect(seckill(LIVE_SECKILL_VOUCHER)).resolves.toHaveProperty('orderId')
  })

  it('一人一单是**按券**的，同一个人可以抢不同券', async () => {
    setToken('mock-token-13800000000')
    await seckill(LIVE_SECKILL_VOUCHER)
    await expect(seckill(103)).resolves.toHaveProperty('orderId')
  })

  it('库存耗尽 → 库存不足', async () => {
    setToken('mock-token-13800000000')
    __mockSetStock(LIVE_SECKILL_VOUCHER, 0)
    await expect(seckill(LIVE_SECKILL_VOUCHER)).rejects.toThrow('库存不足')
  })

  it('最后一张抢完，下一个人就没得抢了', async () => {
    __mockSetStock(LIVE_SECKILL_VOUCHER, 1)
    setToken('mock-token-13800000000')
    await expect(seckill(LIVE_SECKILL_VOUCHER)).resolves.toHaveProperty('orderId')
    setToken('mock-token-13900000000')
    await expect(seckill(LIVE_SECKILL_VOUCHER)).rejects.toThrow('库存不足')
  })

  it('券不存在 / 券没预热 → 优惠券不存在或库存未预热', async () => {
    setToken('mock-token-13800000000')
    await expect(seckill(999_999)).rejects.toThrow('优惠券不存在或库存未预热')
  })

  it('普通券（type = 0）不能秒杀 —— 后端那边它根本没有库存 key', async () => {
    setToken('mock-token-13800000000')
    const normal = mockVouchers.find((v) => v.id === NORMAL_VOUCHER)
    expect(normal?.type).toBe(0)
    await expect(seckill(NORMAL_VOUCHER)).rejects.toThrow('优惠券不存在或库存未预热')
  })

  it('抛出来的都是 ApiError（界面据 errorMsg 显示，不据 error.name）', async () => {
    setToken('mock-token-13800000000')
    await seckill(LIVE_SECKILL_VOUCHER)
    await expect(seckill(LIVE_SECKILL_VOUCHER)).rejects.toBeInstanceOf(ApiError)
  })
})

/**
 * 同仓库跨目录契约：把 `order.ts` 里的三个字面量与**后端源码**对一遍。
 *
 * 这几条用例存在的理由很实在 —— 前端分支的判据是后端手写的字符串，
 * 两边靠「约定」维系。约定会被违反（后端改文案、前端抄漏一个字），
 * 而违反的表现是「后端拒绝了，界面当成成功」，不报错。
 *
 * 前端与后端现在是同一个仓库的兄弟目录，路径**不可能缺失**。早先的
 * `describe.skipIf(...)` 已删掉：读不到源码应当让测试红掉，而不是安静地少跑一组断言。
 */
const BACKEND_SRC = resolve(
  process.cwd(),
  '../server/src/main/java/com/axle/service/impl/VoucherOrderServiceImpl.java',
)

describe('与后端源码对字面量', () => {
  const src = readFileSync(BACKEND_SRC, 'utf8')

  it('三条失败信息在后端源码里逐字存在', () => {
    for (const [name, literal] of Object.entries(SECKILL_ERRORS)) {
      expect(src, `后端源码里找不到 ${name}："${literal}"`).toContain(`Result.fail("${literal}")`)
    }
  })

  it('后端那条活跃的秒杀路径**不校验时间窗** —— 所以前端不该有「尚未开始」的分支', () => {
    // `seckillVoucher`（消息队列版）只按 Lua 的 0/1/2/3 分支。时间窗那两个字符串
    // 若出现在这个方法里，说明后端改了行为，前端的注释与分支要跟着重写。
    const method = src.slice(src.indexOf('public Result seckillVoucher(Long voucherId)'))
    const body = method.slice(0, method.indexOf('\n    }'))
    expect(body).not.toContain('秒杀尚未开始')
    expect(body).not.toContain('秒杀已经结束')
    // 确认取到的确实是活跃那段（而不是被注释掉的旧实现）
    expect(body).toContain('SECKILL_SCRIPT')
  })
})
