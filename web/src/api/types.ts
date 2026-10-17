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
 * `car.name` → 车款名，`car.avgPrice` → 售价，`car.score` → 车况评分。
 *
 * **这是前端的展示模型，不是后端的响应形状。** 后端原样返回的是 {@link CarDTO}，
 * 两者的差异全部由 `adapt.ts` 的 `carFromDTO()` 抹平（逗号串→数组、分→元、
 * 评分÷10、`cutout` 由命名约定推导）。**字段映射只允许发生在 adapt.ts 里** ——
 * 在组件里写 `car.images as unknown as string` 这类补丁，等于把适配层架空。
 *
 * 带 `?` 的字段后端确实可能是 `null`（例如纯电车的 `displacement`、摩托车的
 * `gearbox`），缺失时整行不渲染，不要伪造默认值。
 */
export interface Car {
  id: number
  /** 车款全名，如「保时捷 911 Carrera S」 */
  name: string
  /** 品牌，用于导航与筛选 */
  brand: string
  /**
   * 车辆大类。**缺省视作汽车**：后端 `kind` 列可空，历史数据是 `null`。
   * 判断一律走 `kindOf()`，不要在调用点各写一遍 `?? 'car'`。
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
   *
   * **后端没有这一列，也不该有**：它是前端 `public/cars/cut/` 的目录布局，
   * 由 `adapt.ts` 的 `cutoutOf()` 按文件名约定推导。真机路径下
   * **只有「有抠图产物」的车拿得到它**，而字段的语义是「这台车能上首屏」——
   * 两者在 mock 里靠人工判断对齐（见 `mock.ts` 的素材纪律）。
   */
  cutout?: string
  /** 里程（万公里） */
  mileage?: number
  /** 上牌时间 ISO 字符串 */
  registerDate?: string
  gearbox?: '自动' | '手动'
  /** 能源类型：汽油 / 纯电 / 混动 */
  fuel?: string
  /**
   * 排量，纯电为 `undefined`。
   *
   * **不带 `| null`**：后端该列是 SQL NULL，而 Hutool 序列化会**整个省略 null 字段**，
   * 所以到前端只有「有值」和「键不存在」两种状态，`carFromDTO()` 也把 `null` 归一到
   * `undefined`。声明 `| null` 等于多出一个任何真实响应都产不出的状态。
   */
  displacement?: string
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
 * 购车券，映射 `tb_voucher`（+ `tb_seckill_voucher`）。挂在车上（`carId` = 车 id），
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
  carId: number
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
  /** 以下三个仅 `type = 1` 有值 */
  stock?: number | null
  beginTime?: string | null
  endTime?: string | null
}

/* ⚠️ `tb_voucher` 有 `status` 列（`VoucherMapper.xml` 的 `WHERE v.status = 1` 就在用它），
 * 但它**没有被投影进查询结果** —— 2026-10-16 用 curl 核对过 `/voucher/list/{id}` 的返回，
 * 字段就是不存在。所以 `Voucher` **不要**声明 `status`：留着会让人写出
 * `v.status === 1` 这种永远为假的判断，而且不报错。要过滤券就用 `type` 或 `isSeckillLive()`。
 */

/**
 * 品牌，映射 `tb_shop_type`。导航上「宝马」是 `name`、「BMW」是 `mark` ——
 * 后端那张表只有一个文本列，所以 2026-10-16 给 `tb_shop_type` 加了一个可空的 `mark`。
 */
export interface Brand {
  id: number
  name: string
  /**
   * 品牌字标（`BMW`），零彩色设计下用文字而非彩色图标。后端可空，
   * 缺失时 `brandFromDTO()` 给**空串**，`BrandNav` 那一行就空着。
   *
   * 为什么不用 `name` 兜底：字标走 `--font-display`（Oswald），而 Oswald 没有 CJK 字形，
   * 中文名落进去会掉回另一种字体 —— 一行里两种字体比一行里少一层更难看。
   */
  mark: string
  /**
   * 在售车源数。**后端没有这一列**（`tb_shop_type` 里没有 count），
   * 真机路径恒为 `undefined`，导航上不显示这个数字。mock 有值只是因为
   * mockBrands 手写了它 —— 别据此以为真机也能拿到。
   */
  count?: number
  /**
   * 该品牌在售车源涉及的大类。用来在大类切换时把「一台摩托都没有的品牌」整块撤掉 ——
   * 留着它点进去是空列表，是骗点击。
   *
   * 后端不返回时（`/brand/list` 的响应里没有这一列）视为**未知**，此时不筛，
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

/* ── 后端原样的形状 ────────────────────────────────────────────────────────
 *
 * 下面这几个类型是**后端 JSON 的逐字段镜像**，不是给人看的展示模型。
 * 它们只应该出现在 `car.ts` 的 `get<CarDTO>(...)` 与 `adapt.ts` 的入参上；
 * 组件里一律用 `Car` / `Brand`。让 `Car` 去兼容后端形状（`images` 同时允许
 * `string` 和 `string[]`）是把适配层要解决的问题推给每一个调用点。
 *
 * 名字带 `DTO` 是为了让「这是后端形状」在阅读时一眼可见。
 */

/**
 * `GET /car/{id}`、`GET /car/list` 返回的原始对象。
 *
 * 与 `Car` 的三处不一致（都归 `carFromDTO()` 管）：
 *   * `images` 是**逗号分隔的字符串**（`varchar(1024)`），不是数组
 *   * `avgPrice` / `originalPrice` 单位是**分**
 *   * `score` 是**评分 × 10 的整数**（4.7 分存 47）
 */
export interface CarDTO {
  id: number
  name: string
  typeId: number
  /** 逗号分隔的图片路径，例如 `/cars/a.jpg,/cars/b.jpg` */
  images: string
  area?: string | null
  address: string
  x: number
  y: number
  /** 售价，单位：分 */
  avgPrice: number
  sold: number
  comments: number
  /** 评分 × 10 */
  score: number
  openHours?: string | null
  /** 里程（万公里） */
  mileage?: number | null
  /** 上牌时间 YYYY-MM */
  registerDate?: string | null
  /** 自动 / 手动；摩托车为 null */
  gearbox?: string | null
  fuel?: string | null
  /** 排量；纯电为 null */
  displacement?: string | null
  ownerCount?: number | null
  /** car / motorcycle；历史数据可能为 null */
  kind?: string | null
  /** 新车指导价，单位：分 */
  originalPrice?: number | null
  /** 米，仅 GEO 查询（传了 x/y）时才有 */
  distance?: number | null
  createTime?: string
  updateTime?: string
}

/** `GET /brand/list` 返回的原始对象 */
export interface BrandDTO {
  id: number
  name: string
  mark?: string | null
  icon?: string | null
  sort?: number | null
}

/**
 * `GET /review/hot` 返回的原始对象（后端 `entity/Review.java`）。
 *
 * 与 `Review` 的两处不一致（都归 `reviewFromDTO()` 管）：
 *   * 作者是**三个平铺字段** `userId` / `name` / `icon`，不是嵌套的 `author` 对象
 *   * `images` 是**逗号分隔的字符串**，不是数组
 *
 * ⚠️ `name` / `icon` 在实体上是「用户表的冗余副本」，由 `ReviewServiceImpl.queryHotReview`
 * 的 JOIN 填进来 —— 也就是说这两个字段**只有查询接口才有**，不要以为 `Review` 天然带作者。
 */
export interface ReviewDTO {
  id: number
  carId: number
  userId: number
  /** 作者昵称，来自 JOIN。`tb_blog.name` 这一列的名字与内容不符，别被误导 */
  name?: string | null
  /** 作者头像，来自 JOIN */
  icon?: string | null
  title: string
  /** 逗号分隔的图片路径 */
  images?: string | null
  content?: string | null
  liked?: number | null
  comments?: number | null
  createTime?: string | null
}

/**
 * 登录用户。对应后端 `UserDTO` 的 `{id, nickName, icon}` 三个字段 ——
 * 后端只吐这三个，别指望有手机号或创建时间。
 */
export interface User {
  id: number
  nickName: string
  /** 头像 URL，未设置时后端给的是默认图或空串 */
  icon: string
}

/** 登录表单。后端 `LoginFormDTO` 还有个 `password`，验证码登录用不上 */
export interface LoginForm {
  phone: string
  code: string
}
