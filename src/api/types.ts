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
 * 带 `?` 的是**计划中的后端改造**（`usedcar` 分支）要新增的列 —— 该分支尚未创建
 * （2026-10-16 查实，见 CLAUDE.md 顶部），所以今天只有 mock 路径能填满它们。
 * 真机路径只能映射 `tb_shop` 现有的 15 列，其余字段是 `undefined`。
 * 契约先把字段占住是对的（后端上线后前端不用改），但别把它当成「已经有了」。
 */
export interface Car {
  id: number
  /** 车款全名，如「保时捷 911 Carrera S」 */
  name: string
  /** 品牌，用于导航与筛选 */
  brand: string
  /**
   * 车辆大类。**缺省视作汽车** —— 真机路径现在没有这一列（`usedcar` 分支未建），
   * 而原始池子里也只有汽车。判断一律走 `kindOf()`，不要在调用点各写一遍 `?? 'car'`。
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

/**
 * 购车券，映射 `tb_voucher`（+ `tb_seckill_voucher`）。挂在车上（`shopId` = 车 id），
 * 详情页的「限时特价」区块就是它。
 *
 * **两种券在同一张表里，靠 `type` 分：**
 *
 * - `type = 0` 普通券 —— 只有 `tb_voucher` 那一行，`stock` / `beginTime` / `endTime`
 *   是 `Voucher` 实体上的 `@TableField(exist = false)` 瞬态字段，**左连接没命中就是 null**。
 *   所以这三个字段必须是可空的：把它们当成必定存在会在详情页上渲染出 `NaN` 或 `undefined`。
 * - `type = 1` 秒杀券 —— 有 `tb_seckill_voucher` 那一行，三个字段齐全，可抢。
 *
 * `payValue` / `actualValue` 单位是**分**（后端 `Long`），不是元。显示要除 100。
 */
export interface Voucher {
  id: number
  /** 所属车 id —— 语义上是「这台车」，不是「这家店」 */
  shopId: number
  title: string
  subTitle?: string | null
  /** 使用规则，多行用 `\n` 分隔 */
  rules?: string | null
  /** 支付金额（分） */
  payValue: number
  /** 抵扣金额（分） */
  actualValue: number
  /** 0 = 普通券，1 = 秒杀券 */
  type: number
  status?: number
  /** 以下三个仅 `type = 1` 有值 */
  stock?: number | null
  beginTime?: string | null
  endTime?: string | null
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
