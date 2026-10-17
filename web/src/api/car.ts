import { ApiError, USE_MOCK, get, getPage } from './client'
import { carFromDTO, brandFromDTO, reviewFromDTO } from './adapt'
import { mockBrands, mockCarCoords, mockCars, mockVouchers } from './mock'
import { mockHotReviews } from './mockSocial'
import type {
  ReviewDTO,
  Brand,
  Car,
  Page,
  Review,
  CarDTO,
  BrandDTO,
  VehicleKind,
  Voucher,
} from './types'

/**
 * 默认走 mock，`VITE_USE_MOCK=false` 时连真后端（`serve.js` 把 `/api` 反代到 8081）。
 *
 * 两条路径**必须表现一致** —— 差别只该在数据来源，不该在字段、条数、分页行为上。
 * 历史上不一致的地方（`images` 是字符串、`distance` 每台车都有、`hasMore` 恒 false）
 * 都是真机路径的静默错误，不是「mock 是假的所以无所谓」。
 *
 * 定义在 `client.ts`（全站唯一一处读 `VITE_USE_MOCK` 的地方），这里 re-export 是为了
 * 让既有的 `from '@/api/car'` 引用继续有效。
 */
export { USE_MOCK }

/** 模拟网络往返，让骨架屏/入场动画有真实节奏，而不是瞬间闪一下 */
function delay<T>(value: T, ms = 260): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/**
 * 页大小，与后端 `SystemConstants.MAX_PAGE_SIZE` **必须一致**。
 *
 * 这个数字不只是「一页显示几条」—— `deriveHasMore()` 靠它推「还有没有下一页」，
 * 两边不一致时表现为「列表少了一截」或者「加载更多点了没反应」。
 */
export const PAGE_SIZE = 10

/**
 * 是否还有下一页。
 *
 * **后端不返回 total**：`/car/list` 走的是 `Result.ok(list)` 单参重载，
 * 响应里的 `total` 恒为 `null`。原来写成 `current * PAGE_SIZE < total`，
 * 真机下恒为 `false` —— 列表永远加载不出第二页，而且不报错。
 *
 * 换成「这一页满了就当作还有」：满页即可能还有，不满即到底。代价是
 * **最后一批恰好凑满 10 条时会多一次空请求**（用户点一下没反应，然后再点没反应）。
 * 这是后端不给 total 的前提下无法避免的，选择接受它而不是自己算 total ——
 * 后者要额外发一次 count 查询，为一个纯展示的判断不值得。
 *
 * 注意 GEO 路径有个额外变数：`kind` 是在 GEO 取回之后才筛的（Redis GEO 没有属性过滤），
 * 所以「不满一页」在那里**不**等于到底。调用方见 `fetchCarsByBrand` 的注释。
 */
export function deriveHasMore(loaded: number, pageSize: number = PAGE_SIZE): boolean {
  return loaded >= pageSize
}

/**
 * 车辆大类，缺省视作汽车：`tb_shop.kind` 可空，历史数据（`usedcar.sql` 之前灌的
 * 那批餐饮行）就是 `null`。判断一律走这里，不要在各调用点自己写 `?? 'car'` ——
 * 缺省口径只该有一个出处。
 */
export function kindOf(car: Car): VehicleKind {
  return car.kind ?? 'car'
}

/* ── GEO：附近优先 ─────────────────────────────────────────────────────────
 *
 * 后端把坐标存在 Redis GEO 里，查询硬编码 `new Distance(5000)` —— **5 公里半径**，
 * 没有参数可调。mock 路径复刻同一条规则，好让「附近优先」在两种数据源下
 * 从同一个定位得到同一批车。
 */

/** 与后端 `CarServiceImpl` 里的 `new Distance(5000)` 对齐，单位米 */
const GEO_RADIUS_METERS = 5000

/** Redis 用的地球半径（`geohash_helper.c` 里的 `EARTH_RADIUS_IN_METERS`），单位米 */
const EARTH_RADIUS_METERS = 6_372_797.560856

const toRad = (deg: number) => (deg * Math.PI) / 180

/**
 * 两点球面距离（米）。`x` 是经度、`y` 是纬度 —— 与 `tb_shop.x/y` 和 Redis
 * `GEOSEARCH` 的参数顺序一致（都是 longitude 在前）。
 *
 * 只给 mock 用：真机路径的距离由 Redis 算好放在响应里。之所以自己实现一遍而不是
 * 近似成「经纬度差的平方和」，是因为那样排序会在两个方向上的尺度不同 ——
 * 上海一带（北纬 31°）纬度每度约 111 km、经度每度约 95 km，用欧氏距离排出来的顺序
 * 会和后端不一致。
 */
export function haversineMeters(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dLat = toRad(b.y - a.y)
  const dLon = toRad(b.x - a.x)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.y)) * Math.cos(toRad(b.y)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

/**
 * 附近的车，按距离升序。复刻后端 GEO 分支的三步：半径过滤 → 距离排序 →
 * `limit(current * PAGE_SIZE)` 后 `skip((current-1) * PAGE_SIZE)` 切片。
 *
 * 返回的距离单位是**米**，与后端一致 —— `carFromDTO()` 负责转成公里。
 * 在这里先转会让 mock 与真机在适配层之前就分叉，那种分叉最难查。
 *
 * 半径外一台都没有时返回空数组，这是**正确结果而不是失败**：车源只集中在 3 个城市
 * （上海 5 / 北京 5 / 深圳 4，见 `mock.ts` 的 `mockCarCoords`），这 3 城之外的定位
 * 确实是空的。调用方必须把这条说明白（见 `FilterBar`），不能静默退回普通列表。
 */
export function nearbyCars(
  pool: Car[],
  coords: Record<number, { x: number; y: number }>,
  from: { x: number; y: number },
  current: number,
  pageSize: number = PAGE_SIZE,
): { list: Car[]; distances: Map<number, number> } {
  const withDistance = pool
    .map((car) => ({ car, meters: coords[car.id] ? haversineMeters(from, coords[car.id]) : NaN }))
    .filter((e) => Number.isFinite(e.meters) && e.meters <= GEO_RADIUS_METERS)
    // 距离相同时按 id 兜底排序：同址的两台车（车 4 与车 8 坐标完全一样）
    // 若顺序由 sort 的实现细节决定，两次请求可能给出不同的先后 —— 看起来像列表在跳
    .sort((a, b) => a.meters - b.meters || a.car.id - b.car.id)

  const start = (current - 1) * pageSize
  const page = withDistance.slice(start, start + pageSize)
  return {
    list: page.map((e) => e.car),
    distances: new Map(page.map((e) => [e.car.id, e.meters])),
  }
}

/* ── 品牌表 ──────────────────────────────────────────────────────────────── */

/**
 * 真机路径的品牌表，**进程内缓存一份**。
 *
 * 为什么需要：`tb_shop` 只有 `type_id`，**品牌名在 `tb_shop_type` 里**，而
 * `/car/list` 不做 join（响应里根本没有品牌名字段）。于是每渲染一页车都要
 * 先有品牌表，才有 `carFromDTO(dto, brandName)` 的第二个参数。
 *
 * 记忆化在这里是必要的而不是优化：详情页 + 相似车源 + 列表页会各调一次列表接口，
 * 每次都要品牌表。品牌表在一次会话里几乎不变，发十遍纯属浪费。
 *
 * 失败时**清掉缓存**再抛：留着被拒绝的 promise 会让一次网络抖动变成
 * 「这个会话里品牌表永远拿不到」。
 */
let brandCache: Promise<Brand[]> | null = null

function loadRealBrands(): Promise<Brand[]> {
  brandCache ??= get<BrandDTO[]>('/brand/list')
    .then((list) => list.map(brandFromDTO))
    .catch((err) => {
      brandCache = null
      throw err
    })
  return brandCache
}

/** 真机路径的车源列表 → `Car[]`。品牌名靠 `typeId` 查品牌表补上 */
async function adaptCarDTOs(dtos: CarDTO[]): Promise<Car[]> {
  const brands = await loadRealBrands()
  const nameOf = new Map(brands.map((b) => [b.id, b.name]))
  return dtos.map((s) => carFromDTO(s, nameOf.get(s.typeId) ?? ''))
}

/**
 * GET /brand/list —— 品牌导航。
 *
 * mock 路径的 `kinds` 从 `mockCars` **现算**，不写死在 mockBrands 里：
 * 两处各维护一份必然漂移，而漂移的表现很隐蔽 —— 加一台摩托却忘了更新品牌表，
 * 摩托 tab 下这个品牌就凭空消失，看起来像筛选器坏了。
 *
 * 真机路径**拿不到 `kinds`**：`/brand/list` 不返回这一列，而要为每个品牌算一次
 * 得再发 8 次 `kind=motorcycle` 的查询。留空表示「未知」，`HomeView` 的
 * `visibleBrands` 对未知**不筛**（宁可多显示一个可能为空的品牌，也不能把有车的品牌藏掉）。
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
  return loadRealBrands()
}

/* ── 车源列表 ────────────────────────────────────────────────────────────── */

/**
 * GET /car/list —— 车源列表。传 x/y 时后端走 Redis GEO 距离排序与 5 km 半径过滤，
 * 不传是普通分页。
 *
 * ⚠️ **GEO 分支的 `hasMore` 不可信**：`kind` 是在 GEO 取回之后才筛的（Redis GEO 只认坐标、
 * 没有属性过滤能力），所以「附近优先 + 摩托」这种组合下这一页可能不满、甚至为空，
 * 而窗口外其实还有匹配的车。界面在这种组合下不该把「没更多了」说死。
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
    //
    // 用 `!= null` 而不是真值判断：`typeId = 0` 是个不存在的品牌 id，应当筛出**空**。
    // 真值判断会把它当成「不筛」，于是请求一个不存在的品牌会返回全站车源。
    let pool =
      typeId == null ? mockCars : mockCars.filter((c) => c.brand === mockBrandName(typeId))
    if (kind) pool = pool.filter((c) => kindOf(c) === kind)

    if (x != null && y != null) {
      const { list, distances } = nearbyCars(pool, mockCarCoords, { x, y }, current)
      // 距离补进副本，不写回 mockCars —— 它是模块级共享的常量，
      // 就地改会让「附近优先」的结果渗进后续所有普通列表（距离本来不该出现在那里）
      const withDistance = list.map((c) => ({ ...c, distance: distances.get(c.id)! / 1000 }))
      return delay({
        list: withDistance,
        total: withDistance.length,
        current,
        hasMore: deriveHasMore(withDistance.length),
      })
    }

    const start = (current - 1) * PAGE_SIZE
    // 按 id 升序 —— 与后端那条 `.orderByAsc(Car::getId)` 是**同一条契约**。
    //
    // 为什么不能直接用 mockCars 的数组顺序：那个顺序是编辑排的（首屏四台写在最前面，
    // 好让 `mock.ts` 读起来像一份编排），而 MySQL 返回的是主键序。两者不一致的后果是
    // 「同一页、两种数据源」渲染出**不同的车**：mock 第一页是 5/12/10/4/1/2/3/6/7/8，
    // 真机第一页是 1..10。首屏「精选」取前 6 条，于是同一个首页在两种模式下
    // 展示两组完全不同的车 —— 而这个差异只在切模式时才看得到。
    // `[...pool]` 是必须的：`typeId == null` 时 `pool` **就是** mockCars 这个模块级常量本身，
    // 就地 sort 会永久打乱它（`[...]` 先复制一份）。
    const ordered = [...pool].sort((a, b) => a.id - b.id)
    const list = ordered.slice(start, start + PAGE_SIZE)
    // `total` 给的是**筛完的总数**，但真机路径拿不到它（后端返回 null）。
    // mock 有值只是顺手，界面不许读它 —— 读了就会在真机上变成 0。
    return delay({ list, total: pool.length, current, hasMore: deriveHasMore(list.length) })
  }

  const { list } = await getPage<CarDTO>('/car/list', {
    typeId,
    current,
    kind,
    x,
    y,
  })
  const cars = await adaptCarDTOs(list)
  return { list: cars, total: cars.length, current, hasMore: deriveHasMore(cars.length) }
}

/** `typeId` → 品牌名。查不到给空串（`carFromDTO` 会把它渲染成整行不显示） */
function mockBrandName(typeId: number): string {
  return mockBrands.find((b) => b.id === typeId)?.name ?? ''
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
 * 与 `adapt.ts` 的 `HERO_ELIGIBLE_IDS`（7 台「抠图够干净」的车）的关系是：
 * **这里 4 台是那 7 台里的子集**。7 台是「素材合格」，这 4 台是在合格池里按编辑意图再挑的
 * （两轮两轮、三黑一花）。改这个名单时若加进不在 `HERO_ELIGIBLE_IDS` 里的车，
 * 真机路径会拿不到 `cutout`，首屏那台车就会带着背景原图立在白车台上 —— `car.spec.ts` 挡这条。
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
 *
 * 导出是为了让 `car.spec.ts` 能断言「首屏名单 ⊆ 抠图白名单」这条跨文件的约束。
 */
export const HERO_CAR_IDS = [5, 12, 10, 4]

export async function fetchHeroCars(): Promise<Car[]> {
  if (USE_MOCK) {
    return HERO_CAR_IDS.map((id) => mockCars.find((c) => c.id === id)).filter(
      (c): c is Car => Boolean(c),
    )
  }
  // 真机路径**按 id 逐台取**，不能拿 `fetchFeaturedCars(4)` 代替：
  // 那是「列表前 4 条」，谁排前面取决于数据库返回顺序，与首屏要的这 4 台毫无关系。
  // 4 次请求打的是 `cache:car:{id}`，都在 Redis 里，不是 4 次数据库查询。
  const cars = await Promise.all(HERO_CAR_IDS.map((id) => fetchCarDetail(id)))
  return cars.filter((c): c is Car => Boolean(c))
}

/** GET /car/{id} —— 车辆详情。**不传坐标 → 没有 `distance`**（`hasDealer` 靠 `address`） */
export async function fetchCarDetail(id: number): Promise<Car | undefined> {
  if (USE_MOCK) return delay(mockCars.find((c) => c.id === id))

  // 「车源不存在」要转成 `undefined` 让详情页出空态，**但只转这一种**。
  //
  // 后端在**逻辑过期缓存未命中**时回的正是这一条（`queryWithLogicalExpire` 不回落到
  // 数据库），所以它既表示「这台车真的不在库里」，也表示「`cache:car:{id}` 没预热」——
  // 前端分不出来，只能都当空态。预热靠 `server/scripts/init-car-cache.sh`。
  //
  // 其余错误（超时、5xx、后端没起）**必须继续抛**：一并吞成 `undefined` 的表现是
  // 后端整个挂了却显示「车源不存在」，把一次故障伪装成一个正常的空页面。
  try {
    const dto = await get<CarDTO>(`/car/${id}`)
    return (await adaptCarDTOs([dto]))[0]
  } catch (err) {
    if (err instanceof ApiError && err.message === '车源不存在') return undefined
    throw err
  }
}

/**
 * GET /voucher/list/{carId} —— 该车的购车券。`carId` 在二手车语义下就是**车 id**
 * （一辆车只卖给一个人，车即「店」）。
 *
 * 响应里 `type = 0` 与 `type = 1` **混在一起**（后端是一条 LEFT JOIN），
 * 普通券的 `stock` / `beginTime` / `endTime` 是 `null`。调用方要按 `type` 分支，
 * 别假设这三兄弟总在。
 */
export async function fetchVouchersOfCar(carId: number): Promise<Voucher[]> {
  if (USE_MOCK) return delay(mockVouchers.filter((v) => v.carId === carId))
  return get<Voucher[]>(`/voucher/list/${carId}`)
}

/**
 * 秒杀券此刻是否在售期内。
 *
 * ⚠️ **这是前端自己的判据，比后端更严。** 后端那条异步抢购路径（Lua + Redis Stream）
 * **不校验时间窗** —— 「秒杀尚未开始 / 已经结束」只存在于被注释掉的同步实现里。
 * 所以镜像它的目的不是「和后面端一致」，而是**不给出一个点下去会成功的过期按钮**：
 * 后端不拦，前端再不拦，用户就会对一张早就结束的券下单成功。
 *
 * 判据缺失时**放行**（返回 true）：`type = 1` 本来就该有这两个字段，缺了说明数据不完整，
 * 此时宁可显示按钮让后端去拒绝，也好过把一个真实的在售秒杀藏起来。
 *
 * `now` 可注入，纯函数才好测。
 */
export function isSeckillLive(v: Voucher, now: number = Date.now()): boolean {
  if (v.type !== 1) return false
  if (v.beginTime && now < Date.parse(v.beginTime)) return false
  if (v.endTime && now > Date.parse(v.endTime)) return false
  return true
}

/**
 * 相似车源的挑选口径 —— **mock 与真机共用这一个**。
 *
 * 两处各写一份必然漂移，而漂移的表现是「同一台车在两种数据源下推荐出不同的车」，
 * 排查起来要先把两段逻辑对照着读一遍。抽成纯函数另一个好处是能单测（见 car.spec.ts）。
 *
 * 排序：**同品牌优先，其次同大类**，最后按 `pool` 原序补齐。不随机 ——
 * 每次进详情页推荐都在变，看起来像推荐坏了。
 */
export function pickSimilar(pool: Car[], car: Car, limit = 3): Car[] {
  const others = pool.filter((c) => c.id !== car.id)
  const sameBrand = others.filter((c) => c.brand === car.brand)
  const sameKind = others.filter((c) => kindOf(c) === kindOf(car))

  // Set 去重：同品牌且同大类的车会同时命中前两组
  return [...new Set([...sameBrand, ...sameKind])].slice(0, limit)
}

/**
 * 相似车源。后端**没有**推荐接口，真机路径是拿列表接口的一页在本地挑 ——
 * 是「同一张表的相邻车源」，不是个性化推荐。名字叫 similar 但别读成「智能推荐」。
 *
 * 同品牌的排在前面，所以结果通常和当前车同类，看起来是合理的。
 */
export async function fetchSimilarCars(car: Car, limit = 3): Promise<Car[]> {
  if (USE_MOCK) return delay(pickSimilar(mockCars, car, limit))

  const page = await fetchCarsByBrand({ current: 1, kind: kindOf(car) })
  return pickSimilar(page.list, car, limit)
}

/**
 * GET /review/hot —— 热门口碑。
 *
 * 同样是 `Result.ok(list)` 单参重载，**没有 total**，所以 `hasMore` 用满页判据。
 *
 * ⚠️ 真机分支**必须过 `reviewFromDTO`**：后端 `Review` 的作者是平铺的
 * `userId`/`name`/`icon`，`Review` 要的是嵌套 `author` —— 直接当 `Review` 用会让
 * `ReviewFeed` 读 `undefined.nickName` 抛错，整块口碑区从首页消失且不报明显的错。
 * 详见 `adapt.ts` 的 `reviewFromDTO`。
 *
 * 内容层面这仍然是**餐厅探店**（真机 `tb_blog` 是 hmdp 原始数据，4 行，
 * 图片指向本仓库不存在的 `/imgs/blogs/...`）。把那批内容和图换成车的，是 M4 的事。
 */
export async function fetchHotReviews(current = 1): Promise<Page<Review>> {
  if (USE_MOCK) {
    // 走 `mockSocial` 而不是直接读 `mockReviews`：M4 发布的mock 口碑要能出现在首页，
    // 且排序要与后端一致（后端 `queryHotReview` 是 `liked` 降序，不是数组顺序）。
    return delay(mockHotReviews(current))
  }

  const { list } = await getPage<ReviewDTO>('/review/hot', { current })
  const reviews = list.map(reviewFromDTO)
  return { list: reviews, total: reviews.length, current, hasMore: deriveHasMore(reviews.length) }
}
