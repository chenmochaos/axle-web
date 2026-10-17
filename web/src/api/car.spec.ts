import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  USE_MOCK,
  PAGE_SIZE,
  HERO_CAR_IDS,
  deriveHasMore,
  fetchBrands,
  fetchCarDetail,
  fetchCarsByBrand,
  fetchFeaturedCars,
  fetchHeroCars,
  fetchSimilarCars,
  fetchVouchersOfShop,
  haversineMeters,
  isSeckillLive,
  kindOf,
  pickSimilar,
} from './car'
import { HERO_ELIGIBLE_IDS } from './adapt'
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

describe('deriveHasMore', () => {
  it('满页 → 可能还有；不满页 → 到底了', () => {
    expect(deriveHasMore(PAGE_SIZE)).toBe(true)
    expect(deriveHasMore(PAGE_SIZE - 1)).toBe(false)
    expect(deriveHasMore(PAGE_SIZE + 3)).toBe(true)
    expect(deriveHasMore(0)).toBe(false)
  })

  it('页大小可覆盖（与后端 MAX_PAGE_SIZE 对齐才是默认值）', () => {
    expect(deriveHasMore(5, 5)).toBe(true)
    expect(deriveHasMore(5, 10)).toBe(false)
  })
})

describe('haversineMeters', () => {
  const hangzhou = { x: 120.1279, y: 30.2745 }

  it('同一点距离为 0', () => {
    expect(haversineMeters(hangzhou, hangzhou)).toBe(0)
  })

  it('量与 Redis GEO 同档：杭州 → 上海约 160 km', () => {
    // 与 `redis-cli geodist` 的量级对齐（Redis 用的是同一个球面模型）。
    // 差一点没关系，差一个数量级说明经纬度顺序写反了 —— 那是这个函数最容易犯的错。
    const meters = haversineMeters(hangzhou, { x: 121.5064, y: 31.2454 })
    expect(meters / 1000).toBeGreaterThan(150)
    expect(meters / 1000).toBeLessThan(180)
  })

  it('经度/纬度写反会得出不同的结果 —— 这个函数的参数顺序是有意义的', () => {
    // 防的是「反正都是数字，传反了也跑得动」：传反之后仍然返回一个合理的数字，
    // 只是所有距离都错了，界面上表现为「附近的车排在很后面」。
    const correct = haversineMeters(hangzhou, { x: 121.5064, y: 31.2454 })
    const swapped = haversineMeters(hangzhou, { x: 31.2454, y: 121.5064 })
    expect(Math.abs(correct - swapped)).toBeGreaterThan(1000)
  })
})

describe.runIf(USE_MOCK)('附近优先（GEO）', () => {
  // 深圳南山科技园：车 4 / 5 / 8 / 10 四台都落在 2 km 内。
  // 坐标是**刻意集中**的（上海 5 / 北京 5 / 深圳 4），因为后端半径硬编码 5 km ——
  // 原先 14 台散在 8 个城市、多数城市只有 1 台，这个开关在哪儿都只能查出 1 台。
  const shenzhen = { x: 113.9447, y: 22.5293 }
  // 上海人民广场：车 1 / 2 / 3 / 7 / 9 五台
  const shanghai = { x: 121.4737, y: 31.2304 }
  // 太平洋上：5 km 内一台都没有
  const nowhere = { x: 150, y: 20 }

  it('只返回半径内的车，并按距离升序', async () => {
    const page = await fetchCarsByBrand({ ...shenzhen, current: 1 })
    expect(page.list.length).toBeGreaterThan(0)
    const distances = page.list.map((c) => c.distance!)
    expect([...distances].sort((a, b) => a - b)).toEqual(distances)
  })

  it('同城 4–5 台，别的城市一台都不给', async () => {
    // 锁的是「坐标集中」这个约定本身。半径 5 km 是后端硬编码
    // （`ShopServiceImpl.java` 的 `new Distance(5000)`），所以只有同城车进得来 ——
    // 哪天有人把某台车的坐标改回别的城市，这里会立刻红。
    const near = await fetchCarsByBrand({ ...shenzhen, current: 1 })
    expect(near.list.map((c) => c.id).sort((a, b) => a - b)).toEqual([4, 5, 8, 10])
    const home = await fetchCarsByBrand({ ...shanghai, current: 1 })
    expect(home.list.map((c) => c.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 7, 9])
  })

  it('半径外的车一台都不给 —— 这不是「没有更多」，是「附近没有」', async () => {
    const page = await fetchCarsByBrand({ ...nowhere, current: 1 })
    expect(page.list).toEqual([])
    expect(page.hasMore).toBe(false)
  })

  it('距离单位是**公里**，不是后端给的米', async () => {
    // 站在离车 5 约 1 km 的地方 —— 取一个**非零**的距离验单位。
    // 站在车顶上验证（距离 0）是不行的：除不除 1000 都得 0，那种用例永远绿。
    const page = await fetchCarsByBrand({ x: 113.935, y: 22.53, current: 1 })
    expect(page.list.length).toBeGreaterThan(0)
    for (const car of page.list) {
      expect(car.distance).toBeGreaterThan(0)
      expect(car.distance).toBeLessThan(5) // 半径 5 km 内，且是公里不是米（米会 ≥ 1000）
    }
  })

  it('站得越近排得越前', async () => {
    // 正好站在车 5 的坐标上：它必须排第一且距离为 0（不是「大概第一」）。
    const atCar = await fetchCarsByBrand({ ...shenzhen, current: 1 })
    expect(atCar.list[0].id).toBe(5)
    expect(atCar.list[0].distance).toBe(0)
  })

  it('普通列表**没有** distance —— 距离是查询的属性，不是车的属性', async () => {
    // 这条是回归判据：曾经 mock 把 distance 硬编码在每台车上，
    // 于是首页每张卡片都挂着「距你 16.8 km」，而真机路径一片空白。
    const page = await fetchCarsByBrand({ current: 1 })
    expect(page.list.length).toBeGreaterThan(0)
    expect(page.list.every((c) => c.distance == null)).toBe(true)
  })

  it('GEO 查询不会把 distance 写回共享的 mockCars', async () => {
    // mockCars 是模块级常量。就地改它会让距离渗进后续所有普通列表 ——
    // 而且测试之间会互相污染（顺序不同结果不同，最难查的一类）。
    await fetchCarsByBrand({ ...shenzhen, current: 1 })
    expect(mockCars.every((c) => c.distance == null)).toBe(true)
  })

  it('品牌 + 附近可以叠加', async () => {
    // 站在上海：半径内有宝马 1/2、奔驰 3/7、特斯拉 9
    const bmw = (await fetchBrands()).find((b) => b.name === '宝马')
    const page = await fetchCarsByBrand({ typeId: bmw?.id, ...shanghai, current: 1 })
    // `every` 对空数组恒真 —— 不先断非空的话，筛选条件写错也照样绿。
    expect(page.list.length).toBeGreaterThan(0)
    expect(page.list.every((c) => c.brand === '宝马')).toBe(true)
  })
})

describe.runIf(USE_MOCK)('分页（mock 与真机同一套行为）', () => {
  it('第一页 10 条，且 hasMore 为 true —— 否则「加载更多」永远点不出第二页', async () => {
    const page = await fetchCarsByBrand({ current: 1 })
    expect(page.list).toHaveLength(PAGE_SIZE)
    expect(page.hasMore).toBe(true)
  })

  it('第二页拿到剩下的车，且与第一页不重叠', async () => {
    const p1 = await fetchCarsByBrand({ current: 1 })
    const p2 = await fetchCarsByBrand({ current: 2 })
    expect(p2.list.length).toBe(mockCars.length - PAGE_SIZE)
    expect(p2.hasMore).toBe(false)
    const ids = new Set(p1.list.map((c) => c.id))
    expect(p2.list.some((c) => ids.has(c.id))).toBe(false)
  })

  it('按 id 升序返回 —— 与后端 `.orderByAsc(id)` 是同一条契约', async () => {
    // 这条守的是「同一页、两种数据源」：mockCars 的数组顺序是编辑排的
    // （首屏四台写在最前面），MySQL 返回的是主键序。不排就会渲染出两组不同的车，
    // 首屏「精选 6 台」尤其明显 —— 而切模式才看得到。
    const p1 = await fetchCarsByBrand({ current: 1 })
    expect(p1.list.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    const p2 = await fetchCarsByBrand({ current: 2 })
    expect(p2.list.map((c) => c.id)).toEqual([11, 12, 13])
  })

  it('排序不会就地改动 mockCars 的顺序', async () => {
    // `typeId == null` 时 pool 就是 mockCars 本身，忘了先复制就会永久打乱共享常量
    const first = mockCars[0].id
    await fetchCarsByBrand({ current: 1 })
    expect(mockCars[0].id).toBe(first)
  })

  it('越界页码返回空数组而不是抛错', async () => {
    const page = await fetchCarsByBrand({ current: 99 })
    expect(page.list).toEqual([])
    expect(page.hasMore).toBe(false)
  })

  it('不存在的品牌 id 返回空，**不是**全站车源', async () => {
    // 真值判断会踩到这条：`typeId ? 筛 : 全部` 对 `typeId = 0` 会放行全部车源
    expect((await fetchCarsByBrand({ typeId: 0 })).list).toEqual([])
    expect((await fetchCarsByBrand({ typeId: 999 })).list).toEqual([])
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

  it('首屏四台都在 HERO_ELIGIBLE_IDS 里 —— mock 能上首屏，真机也必须能', async () => {
    // 真机路径下 `cutout` 只发给白名单里的车（见 adapt.ts）。首屏名单若加进一个
    // 不在白名单里的 id，mock 下一切正常（mockCars 手写了 cutout），
    // 真机下那台车就会带着背景原图立在白车台上 —— 只在真机可见的差异。
    const hero = await fetchHeroCars()
    expect(hero.filter((c) => !HERO_ELIGIBLE_IDS.has(c.id))).toEqual([])
  })

  it('首屏名单里的车真的存在（改了 id 却忘了改车源表会被挡住）', async () => {
    expect(await fetchHeroCars()).toHaveLength(HERO_CAR_IDS.length)
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

  it('秒杀券的 stock 与时间窗齐全 —— 判据是**存在**，不是「大于 0」', () => {
    const seckill = mockVouchers.filter((v) => v.type === 1)
    expect(seckill.length).toBeGreaterThan(0)
    for (const v of seckill) {
      // 不能断言 stock > 0：售罄或已结束的秒杀券 stock 就是 0（券 105 正是如此）。
      // 不变量是「type = 1 ⇒ 这三个字段有值」，而不是它们有正数 ——
      // 后者会把「已结束」这个真实状态判成数据错误。
      expect(v.stock).toBeTypeOf('number')
      expect(v.beginTime).toBeTruthy()
      expect(v.endTime).toBeTruthy()
    }
  })

  it('在售中与已结束的秒杀券**都有**，否则有一半的界面分支从没被渲染过', () => {
    const now = Date.now()
    const live = mockVouchers.filter((v) => v.type === 1 && isSeckillLive(v, now))
    const ended = mockVouchers.filter((v) => v.type === 1 && !isSeckillLive(v, now))

    // 在售：详情页的抢购条 + 抢购页的正常态靠它
    expect(live.length).toBeGreaterThan(0)
    expect(live.every((v) => (v.stock ?? 0) > 0)).toBe(true)
    // 已结束：`v-if="!liveSeckill"` 的「本场已结束」分支靠它。少了它，
    // 那个分支写错了也不会有人发现。
    expect(ended.length).toBeGreaterThan(0)
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
