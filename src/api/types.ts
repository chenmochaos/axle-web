/** 后端统一响应体：{"success":bool,"errorMsg":string|null,"data":any,"total":long|null} */
export interface ApiResult<T> {
  success: boolean
  errorMsg: string | null
  data: T
  total: number | null
}

/** 分页查询参数（后端用 current 页码，不是 offset） */
export interface PageQuery {
  current?: number
}

/**
 * 车辆大类。摩托与汽车**混在同一个车源池里** —— 同一张 `tb_shop`、同一套接口、同一个列表，
 * 靠这个字段区分。拆成两张表要想清楚代价：后端 schema、全部查询、缓存 key、GEO 周边
 * 都要分叉，而「摩托也是车，只是少两个轮子」在数据模型上是成立的。
 */
export type VehicleKind = 'car' | 'motorcycle'

/** 首页大类筛选。`all` 不是 VehicleKind —— 它表示「不筛」，不是「第三种车」 */
export type KindFilter = 'all' | VehicleKind

/**
 * 车辆。字段是 `tb_shop` 到二手车的语义映射：
 * `shop.name` → 车款名，`shop.avgPrice` → 售价，`shop.score` → 车况评分。
 *
 * 带 `?` 的是后端改造（分支 usedcar）新增的列，未上线前由 mock 补齐。
 */
export interface Car {
  id: number
  /** 车款全名，如「保时捷 911 Carrera S」 */
  name: string
  /** 品牌，用于导航与筛选 */
  brand: string
  /**
   * 车辆大类。**缺省视作汽车** —— 后端 `usedcar` 分支加这一列之前的老数据没有它，
   * 而那时池子里也只有汽车。判断一律走 `kindOf()`，不要在调用点各写一遍 `?? 'car'`。
   */
  kind?: VehicleKind
  /** 售价（元） */
  price: number
  /** 新车指导价（元），用于展示折价 */
  originalPrice?: number
  images: string[]
  /**
   * 透明背景抠图（`scripts/cutout-cars.py` 生成）。
   *
   * 首屏把车放在统一的白色车台上，靠的就是它 —— 图库照片背景各不相同，
   * 只有把背景去掉，背景才能由界面统一提供。
   * 后端不返回这个字段时前端回退到 `images[0]`，所以是可选的。
   */
  cutout?: string
  /** 里程（万公里） */
  mileage?: number
  /** 上牌时间 ISO 字符串 */
  registerDate?: string
  gearbox?: '自动' | '手动'
  /** 能源类型：汽油 / 纯电 / 混动 */
  fuel?: string
  /** 排量，纯电为 null */
  displacement?: string | null
  /** 过户次数，0 为一手车 */
  ownerCount?: number
  address: string
  /** 车况评分 0–5 */
  score: number
  /** 已咨询人数 */
  sold: number
  /** GEO 距离（km），仅在传了坐标时后端返回 */
  distance?: number
}

export interface Brand {
  id: number
  name: string
  /** 品牌 logo 字符或缩写，零彩色设计下用文字而非彩色图标 */
  mark: string
  /** 在售车源数 */
  count?: number
  /**
   * 该品牌在售车源涉及的大类。用来在大类切换时把「一台摩托都没有的品牌」整块撤掉 ——
   * 留着它点进去是空列表，是骗点击。
   *
   * 后端不返回时（`/shop-type/list` 的响应里没有这一列）视为**未知**，此时不筛，
   * 而不是当作「什么车都没有」。见 `HomeView` 的 `visibleBrands`。
   */
  kinds?: VehicleKind[]
}

export interface Review {
  id: number
  title: string
  content: string
  images: string[]
  liked: number
  comments: number
  createTime: string
  author: {
    id: number
    nickName: string
    icon: string
  }
}

export interface Page<T> {
  list: T[]
  total: number
  current: number
  hasMore: boolean
}
