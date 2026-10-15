import { get, getPage } from './client'
import { mockBrands, mockCars, mockReviews } from './mock'
import type { Brand, Car, Page, Review } from './types'

/**
 * 后端 `tb_shop` 的车辆扩展字段（mileage/registerDate/…）还没上线，
 * 默认走 mock。后端数据就绪后在 `.env.local` 里设 `VITE_USE_MOCK=false`。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

/** 模拟网络往返，让骨架屏/入场动画有真实节奏，而不是瞬间闪一下 */
function delay<T>(value: T, ms = 260): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/** GET /shop-type/list —— 品牌导航 */
export async function fetchBrands(): Promise<Brand[]> {
  if (USE_MOCK) return delay(mockBrands)
  return get<Brand[]>('/shop-type/list')
}

/**
 * GET /shop/of/type —— 车源列表。
 * 传 x/y 时后端走 Redis GEO 距离排序，不传是普通分页。
 */
export async function fetchCarsByBrand(params: {
  typeId?: number
  current?: number
  x?: number
  y?: number
}): Promise<Page<Car>> {
  const { typeId, current = 1, x, y } = params

  if (USE_MOCK) {
    // typeId 是品牌 id，car.brand 是品牌名，中间要过一次 mockBrands。
    // 曾经这里直接拿 String(typeId) 比 car.brand（'1' vs '保时捷'），永远查不到。
    const brandName = mockBrands.find((b) => b.id === typeId)?.name
    const list = typeId ? mockCars.filter((c) => c.brand === brandName) : mockCars
    return delay({ list, total: list.length, current, hasMore: false })
  }

  const { list, total } = await getPage<Car>('/shop/of/type', {
    typeId,
    current,
    x,
    y,
  })

  return { list, total, current, hasMore: current * 10 < total }
}

/** 首页精选：直接取全量前 N 条 */
export async function fetchFeaturedCars(limit = 6): Promise<Car[]> {
  const page = await fetchCarsByBrand({ current: 1 })
  return page.list.slice(0, limit)
}

/**
 * 首屏轮播用的车。
 *
 * 为什么单独挑而不是取前 4 条：首屏是「车居中立在舞台上」的构图，
 * 对素材要求比列表卡片高得多 —— 必须是 3/4 前脸、抠图干净、车身不贴画幅边缘。
 * 现有的 13 张里符合的只有这几台，所以是编辑精选，不是数据切片。
 *
 * 首屏不能等网络，所以不走 delay()。
 */
const HERO_CAR_IDS = [8, 4, 5, 6]

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
