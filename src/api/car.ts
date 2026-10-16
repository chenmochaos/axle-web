import { get, getPage } from './client'
import { mockBrands, mockCars, mockReviews } from './mock'
import type { Brand, Car, Page, Review, VehicleKind } from './types'

/**
 * 后端 `tb_shop` 的车辆扩展字段（mileage/registerDate/…）还没上线，
 * 默认走 mock。后端数据就绪后在 `.env.local` 里设 `VITE_USE_MOCK=false`。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

/** 模拟网络往返，让骨架屏/入场动画有真实节奏，而不是瞬间闪一下 */
function delay<T>(value: T, ms = 260): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/**
 * 车辆大类，缺省视作汽车（后端 `usedcar` 分支加这一列之前的老数据没有它，
 * 而那时池子里只有汽车）。判断一律走这里，不要在各调用点自己写 `?? 'car'` ——
 * 缺省口径只该有一个出处。
 */
export function kindOf(car: Car): VehicleKind {
  return car.kind ?? 'car'
}

/**
 * GET /shop-type/list —— 品牌导航。
 *
 * mock 路径的 `kinds` 从 `mockCars` **现算**，不写死在 mockBrands 里：
 * 两处各维护一份必然漂移，而漂移的表现很隐蔽 —— 加一台摩托却忘了更新品牌表，
 * 摩托 tab 下这个品牌就凭空消失，看起来像筛选器坏了。
 */
export async function fetchBrands(): Promise<Brand[]> {
  if (USE_MOCK) {
    return delay(
      mockBrands.map((b) => ({
        ...b,
        kinds: [...new Set(mockCars.filter((c) => c.brand === b.name).map(kindOf))],
      })),
    )
  }
  return get<Brand[]>('/shop-type/list')
}

/**
 * GET /shop/of/type —— 车源列表。
 * 传 x/y 时后端走 Redis GEO 距离排序，不传是普通分页。
 *
 * `kind` 目前只有 mock 路径真的在筛；真机路径照发是因为后端 `usedcar` 分支要按它加
 * where 条件，前端先把参数这个口径占住，后端上线后不用再改前端。
 */
export async function fetchCarsByBrand(params: {
  typeId?: number
  current?: number
  kind?: VehicleKind
  x?: number
  y?: number
}): Promise<Page<Car>> {
  const { typeId, current = 1, kind, x, y } = params

  if (USE_MOCK) {
    // typeId 是品牌 id，car.brand 是品牌名，中间要过一次 mockBrands。
    // 曾经这里直接拿 String(typeId) 比 car.brand（'1' vs '保时捷'），永远查不到。
    const brandName = mockBrands.find((b) => b.id === typeId)?.name
    let list = typeId ? mockCars.filter((c) => c.brand === brandName) : mockCars
    if (kind) list = list.filter((c) => kindOf(c) === kind)
    return delay({ list, total: list.length, current, hasMore: false })
  }

  const { list, total } = await getPage<Car>('/shop/of/type', {
    typeId,
    current,
    kind,
    x,
    y,
  })

  return { list, total, current, hasMore: current * 10 < total }
}

/** 首页精选：直接取全量前 N 条，可选按大类筛 */
export async function fetchFeaturedCars(limit = 6, kind?: VehicleKind): Promise<Car[]> {
  const page = await fetchCarsByBrand({ current: 1, kind })
  return page.list.slice(0, limit)
}

/**
 * 首屏轮播用的车。
 *
 * 为什么单独挑而不是取前 4 条：首屏是「车居中立在舞台上」的构图，对素材的要求比列表卡片
 * 高一个档 —— 卡片用原图，有背景兜着；首屏用抠图立在白底车台上，抠图脏一点就全场可见。
 *
 * **入选口径只有一条：抠图干净。** 2026-10-16 按这条重选了一轮，上一轮的
 * Manhart MH4 / S 1000 RR / AMG GT 63 S 三台全部落选（车轮被平切、抠进车间沥青地面、
 * 把玻璃幕墙糊进车身），换成下面四台 —— 四张都在深底和浅底上目检过，轮子完整、无混入色块。
 *
 * 怎么判「干净」是可复现的，别靠印象（血泪教训：`--check` 的连通域指标查不出轮子被吃掉，
 * 缩略图也看不出朝向）：
 *
 * 1. 几何体检：轮廓最后几行的宽度必须**单调收窄到接近 0**。车停在地上时轮胎最低点是一个
 *    切点，若最后一行还很宽然后骤停，说明轮廓被一条水平线切断，即「少轮子」。
 *    同理看连通域数量（游离碎片）与次块占比。
 * 2. **合成到深底上目检**。白底会把混进来的浅色地面、阴影藏在白色里 —— 深底让任何非车身
 *    像素现形。GSX250R 的底部有一条 1053px 宽的草地带，白底完全看不出，深底一目了然。
 *
 * 注意 `crop(getbbox())` 意味着**每张抠图产物的 alpha 都必然贴满四边**，所以
 * 「贴边」这个指标对抠图产物恒成立、无鉴别力，只在检查源图时才有意义。
 *
 * 编辑意向「尽量黑」的落点：四台里三台黑（M4 Vorsteiner / MX-5 / CFMOTO 675SR）。
 * 第四台的火刃是红蓝白花的 —— 不是选择，是池子里干净的摩托抠图只有两张
 * （另一张就是 CFMOTO），没有可替换的余地。想要第四台也素净，得先补一张干净的摩托侧身照。
 * 车头朝向没作要求，实际是「左-右-左-右」交替，反而有节奏。
 *
 * 首屏不能等网络，所以不走 delay()。
 */
const HERO_CAR_IDS = [5, 12, 10, 4]

export async function fetchHeroCars(): Promise<Car[]> {
  if (USE_MOCK) {
    return HERO_CAR_IDS.map((id) => mockCars.find((c) => c.id === id)).filter(
      (c): c is Car => Boolean(c),
    )
  }
  return fetchFeaturedCars(HERO_CAR_IDS.length)
}

/** GET /shop/{id} —— 车辆详情 */
export async function fetchCarDetail(id: number): Promise<Car | undefined> {
  if (USE_MOCK) return delay(mockCars.find((c) => c.id === id))
  return get<Car>(`/shop/${id}`)
}

/** GET /blog/hot —— 热门口碑 */
export async function fetchHotReviews(current = 1): Promise<Page<Review>> {
  if (USE_MOCK) {
    return delay({ list: mockReviews, total: mockReviews.length, current, hasMore: false })
  }

  const { list, total } = await getPage<Review>('/blog/hot', { current })
  return { list, total, current, hasMore: current * 10 < total }
}
