import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  USE_MOCK,
  fetchBrands,
  fetchCarDetail,
  fetchCarsByBrand,
  fetchFeaturedCars,
  fetchHeroCars,
  fetchSimilarCars,
  fetchVouchersOfShop,
  isSeckillLive,
  kindOf,
  pickSimilar,
} from './car'
import { mockCars, mockVouchers } from './mock'
import type { VehicleKind, Voucher } from './types'

/**
 * 这些用例守的不是「函数返回值长什么样」，是几次真踩过的坑：
 *
 * 1. 卡片图指向已删文件 → 静默渲染成空图，不报错（上一轮换素材时全站卡片都白了）
 * 2. `typeId`（品牌 id）当品牌名比 → 按品牌筛永远返回空（`'1' !== '保时捷'`）
 * 3. 大类筛选加进来之后，品牌的 `kinds` 和车源表漂移 → 某个 tab 下品牌凭空消失
 * 4. 详情页多图：`images[0]` 查过了不算完，缩略图条读的是**后面几张**
 * 5. 秒杀券过期 → 抢购条静默消失（所以时间窗必须是算出来的，不能硬编码）
 *
 * 都是「不报错、只是不对」的失败，所以值得用断言钉住。
 */

/** '/cars/cut/x.webp' → '<repo>/public/cars/cut/x.webp' */
const onDisk = (url: string) => resolve(process.cwd(), 'public', url.replace(/^\//, ''))

/** 真机路径没有 mock 数据可查，这组用例整体跳过（`VITE_USE_MOCK=false pnpm test` 时） */
describe.runIf(USE_MOCK)('mock 车源与素材', () => {
  it('每台车的**每一张** images[i] 都指向真实存在的文件', () => {
    const missing = mockCars
      .flatMap((c) => c.images.map((src) => ({ c, src })))
      .filter(({ src }) => !existsSync(onDisk(src)))
      .map(({ c, src }) => `${c.name} → ${src}`)
    expect(missing).toEqual([])
  })

  it('有第二张图的车的每张图都不同 —— 不拿同一张重复凑成「多图」', () => {
    const dup = mockCars
      .filter((c) => c.images.length > 1 && new Set(c.images).size !== c.images.length)
      .map((c) => c.name)
    expect(dup).toEqual([])
  })

  it('给了 cutout 的，抠图文件也真实存在', () => {
    const missing = mockCars
      .filter((c) => c.cutout && !existsSync(onDisk(c.cutout)))
      .map((c) => `${c.name} → ${c.cutout}`)
    expect(missing).toEqual([])
  })

  it('kind 缺省视作汽车', () => {
    expect(kindOf({ ...mockCars[0], kind: undefined })).toBe('car')
    expect(kindOf({ ...mockCars[0], kind: 'motorcycle' })).toBe('motorcycle')
  })
})

describe.runIf(USE_MOCK)('首屏选车（编辑口径）', () => {
  it('四台：两辆摩托 + 两辆汽车', async () => {
    const hero = await fetchHeroCars()
    expect(hero).toHaveLength(4)
    expect(hero.filter((c) => kindOf(c) === 'motorcycle')).toHaveLength(2)
    expect(hero.filter((c) => kindOf(c) === 'car')).toHaveLength(2)
  })

  it('四台都带 cutout —— 首屏是白底车台，没有抠图就立不住', async () => {
    const hero = await fetchHeroCars()
    const noCutout = hero.filter((c) => !c.cutout?.includes('/cars/cut/')).map((c) => c.name)
    expect(noCutout).toEqual([])
  })
})

describe.runIf(USE_MOCK)('按大类与品牌筛选', () => {
  it('品牌的 kinds 从车源表现算，且不会出现「点进去是空」的品牌', async () => {
    const brands = await fetchBrands()
    const kindsOf = (name: string) => brands.find((b) => b.name === name)?.kinds ?? []

    expect(kindsOf('宝马')).toContain('car')
    expect(kindsOf('宝马')).toContain('motorcycle')
    expect(kindsOf('春风动力')).toEqual<VehicleKind[]>(['motorcycle'])
    expect(kindsOf('奥迪')).toEqual<VehicleKind[]>(['car'])
    expect(brands.every((b) => (b.kinds?.length ?? 0) > 0)).toBe(true)
  })

  it('不传 kind 时返回全量前 N 条（老行为不变）', async () => {
    expect(await fetchFeaturedCars(6)).toHaveLength(6)
  })

  it('传 kind 时只返回该大类，且能取满（摩托不够 6 台就返回全部 4 台）', async () => {
    const motos = await fetchFeaturedCars(6, 'motorcycle')
    expect(motos).toHaveLength(4)
    expect(motos.every((c) => kindOf(c) === 'motorcycle')).toBe(true)
  })

  it('按品牌 id 查得到车（typeId → 品牌名 的映射没断）', async () => {
    const bmw = (await fetchBrands()).find((b) => b.name === '宝马')
    expect(bmw).toBeDefined()

    const page = await fetchCarsByBrand({ typeId: bmw?.id })
    expect(page.list.length).toBeGreaterThan(0)
    expect(page.list.every((c) => c.brand === '宝马')).toBe(true)
  })

  it('品牌 + 大类可以叠加', async () => {
    const bmw = (await fetchBrands()).find((b) => b.name === '宝马')
    const page = await fetchCarsByBrand({ typeId: bmw?.id, kind: 'motorcycle' })
    expect(page.list.length).toBeGreaterThan(0)
    expect(page.list.every((c) => c.brand === '宝马' && kindOf(c) === 'motorcycle')).toBe(true)
  })
})

describe.runIf(USE_MOCK)('车辆详情', () => {
  it('取得到存在的车', async () => {
    const car = await fetchCarDetail(5)
    expect(car?.id).toBe(5)
  })

  it('越界 id 返回 undefined 而不是抛错 —— 详情页靠它出空态', async () => {
    await expect(fetchCarDetail(999_999)).resolves.toBeUndefined()
    await expect(fetchCarDetail(-1)).resolves.toBeUndefined()
  })
})

describe('pickSimilar / fetchSimilarCars', () => {
  const target = mockCars.find((c) => c.id === 5)!

  it('永远不含自己', () => {
    expect(pickSimilar(mockCars, target, 100).some((c) => c.id === 5)).toBe(false)
  })

  it('同品牌排在同大类之前', () => {
    const picked = pickSimilar(mockCars, target, 3)
    // 车 5 是宝马汽车 → 先出宝马（1 / 2 / 6），其中 2 是摩托
    expect(picked.map((c) => c.brand)).toEqual(['宝马', '宝马', '宝马'])
  })

  it('同品牌不够 limit 时用同大类补齐', () => {
    // 特斯拉只有一台车（9），同品牌邻居为 0，全部靠同大类补
    const tesla = mockCars.find((c) => c.id === 9)!
    const picked = pickSimilar(mockCars, tesla, 3)
    expect(picked).toHaveLength(3)
    expect(picked.every((c) => kindOf(c) === 'car')).toBe(true)
  })

  it('结果不重复 —— 同品牌且同大类会同时命中两组', () => {
    const picked = pickSimilar(mockCars, target, 100)
    expect(new Set(picked.map((c) => c.id)).size).toBe(picked.length)
  })

  it('稳定：同一输入两次调用结果一致（推荐不该每刷新一次就变）', () => {
    expect(pickSimilar(mockCars, target, 3)).toEqual(pickSimilar(mockCars, target, 3))
  })

  it('池子里只有自己时返回空数组，不报错', () => {
    expect(pickSimilar([target], target, 3)).toEqual([])
  })

  it('fetchSimilarCars 默认取 3 台，且不含自己', async () => {
    const picked = await fetchSimilarCars(target)
    expect(picked).toHaveLength(3)
    expect(picked.some((c) => c.id === target.id)).toBe(false)
  })
})

describe.runIf(USE_MOCK)('购车券', () => {
  it('按 shopId 取，不串车', async () => {
    const ofCar5 = await fetchVouchersOfShop(5)
    expect(ofCar5.length).toBeGreaterThan(0)
    expect(ofCar5.every((v) => v.shopId === 5)).toBe(true)
  })

  it('没有券的车返回空数组 —— 详情页据此整块不渲染', async () => {
    expect(await fetchVouchersOfShop(4)).toEqual([])
  })

  it('汇总接口把两种券混在一起返回（后端就是一条 LEFT JOIN）', async () => {
    const all = await fetchVouchersOfShop(5)
    expect(new Set(all.map((v) => v.type))).toEqual(new Set([0, 1]))
  })

  it('普通券没有 stock / beginTime / endTime —— 渲染时不能假设它们存在', () => {
    const normal = mockVouchers.filter((v) => v.type === 0)
    expect(normal.length).toBeGreaterThan(0)
    for (const v of normal) {
      expect(v.stock ?? null).toBeNull()
      expect(v.beginTime ?? null).toBeNull()
      expect(v.endTime ?? null).toBeNull()
    }
  })

  it('秒杀券的 stock 与时间窗齐全', () => {
    const seckill = mockVouchers.filter((v) => v.type === 1)
    expect(seckill.length).toBeGreaterThan(0)
    for (const v of seckill) {
      expect(v.stock).toBeGreaterThan(0)
      expect(v.beginTime).toBeTruthy()
      expect(v.endTime).toBeTruthy()
    }
  })

  it('秒杀券真的在售期内 —— 时间窗写死会在某天静默失效', async () => {
    const seckill = (await fetchVouchersOfShop(5)).filter((v) => v.type === 1)
    expect(seckill.length).toBeGreaterThan(0)
    expect(seckill.every((v) => isSeckillLive(v))).toBe(true)
  })

  it('时间串是本地时间格式，不带 Z 也不带毫秒 —— 与 Jackson 的 LocalDateTime 一致', () => {
    for (const v of mockVouchers.filter((x) => x.type === 1)) {
      expect(v.beginTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
      expect(v.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
      // 解析回来应当是本地时间语义，往返不丢
      expect(Number.isNaN(Date.parse(v.beginTime!))).toBe(false)
      expect(Date.parse(v.endTime!) - Date.parse(v.beginTime!)).toBeGreaterThan(0)
    }
  })
})

describe('isSeckillLive', () => {
  const seckill = (over: Partial<Voucher> = {}): Voucher => ({
    id: 1,
    shopId: 1,
    title: 't',
    payValue: 100,
    actualValue: 200,
    type: 1,
    status: 1,
    stock: 10,
    beginTime: '2026-10-01T00:00:00',
    endTime: '2026-10-31T00:00:00',
    ...over,
  })

  const inWindow = Date.parse('2026-10-15T12:00:00')

  it('在窗口内 → true', () => {
    expect(isSeckillLive(seckill(), inWindow)).toBe(true)
  })

  it('还没开始 → false', () => {
    expect(isSeckillLive(seckill(), Date.parse('2026-09-30T23:59:59'))).toBe(false)
  })

  it('已经结束 → false', () => {
    expect(isSeckillLive(seckill(), Date.parse('2026-11-01T00:00:01'))).toBe(false)
  })

  it('边界算在售期内（闭区间）', () => {
    expect(isSeckillLive(seckill(), Date.parse('2026-10-01T00:00:00'))).toBe(true)
    expect(isSeckillLive(seckill(), Date.parse('2026-10-31T00:00:00'))).toBe(true)
  })

  it('普通券永远不是秒杀', () => {
    expect(isSeckillLive(seckill({ type: 0 }), inWindow)).toBe(false)
  })

  it('时间窗缺失时放行 —— 数据不全时宁可让后端去拒绝，也不藏掉真实的秒杀', () => {
    expect(isSeckillLive(seckill({ beginTime: null, endTime: null }), inWindow)).toBe(true)
  })
})
