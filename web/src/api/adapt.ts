import type { ReviewDTO, Brand, Car, Review, CarDTO, BrandDTO, VehicleKind } from './types'

/**
 * 后端形状 → 前端展示模型。**字段映射只允许发生在这个文件里。**
 *
 * ── 为什么需要一个适配层 ────────────────────────────────────────────────
 *
 * 后端是 hmdp（黑马点评）的车源接口，前端是二手车平台。表名、接口路径、
 * 响应结构全部保持不变，差异靠这一层抹平。三处不一致是**结构性的**，不是遗漏：
 *
 * | 后端 | 前端 | 为什么不让步 |
 * |---|---|---|
 * | `images` 是逗号串 `varchar(1024)` | `images: string[]` | 那是 MySQL 没有数组类型的妥协，不是前端该继承的模型 |
 * | `avgPrice` 单位是分 | `price` 单位是元 | hmdp 原语义就是分（`tb_voucher.pay_value` 同理）。改后端单位会静默破坏契约 |
 * | `score` 是评分 ×10 的整数 | `score` 是 0–5 的小数 | 同上，避免小数是后端的存储决策 |
 *
 * 在组件里就地打补丁（`car.images as unknown as string[]`、`/100` 散落在模板里）
 * 等于把这一层架空：每多一个调用点就多一次漏改的机会，而漏掉的表现是
 * 详情页白屏（`CarHero` 对字符串调 `.filter` 会直接抛 TypeError）。
 *
 * ── 反向也成立 ────────────────────────────────────────────────────────
 *
 * `Car` / `Brand` **不要**去兼容后端形状（比如把 `images` 声明成 `string | string[]`）。
 * 那会把「有两种形状」这个事实推给每一个读到这个类型的人，而适配层的存在
 * 恰恰是为了让下游只面对一种。
 */

/**
 * 能上首屏的车 —— 判据**只有一条：抠图干净**（口径与 `mock.ts` 的素材纪律一致，
 * 见 `car.ts` 的 `HERO_CAR_IDS`）。
 *
 * 为什么需要一张白名单：`public/cars/cut/` 下有 22 个抠图产物，但**能用在上首屏的只有 7 个**，
 * 其余是抠脏了被撤下来的（车轮被平切、把玻璃幕墙糊进车身、底部拖一条草地带）。
 * 按文件存在与否推导「有抠图」会得出 22 台车都能上首屏的错误结论 ——
 * 而 `cutout` 字段的语义是「这台车能上首屏」，不是「这台车有抠图文件」。
 *
 * 名单按 **车 id** 写，因为 mock 与真机共用同一套 id（`usedcar.sql` 里
 * `tb_shop.id` 就是按 `mockCars[].id` 灌的）。`adapt.spec.ts` 会拿 mock 的
 * `cutout` 字段与这份名单对账，两边漂移会被测试挡住。
 */
export const HERO_ELIGIBLE_IDS: ReadonlySet<number> = new Set([4, 5, 6, 7, 9, 10, 12])

/** 抠图产物目录。与 `scripts/cutout-cars.py` 的输出路径绑定 */
const CUT_DIR = '/cars/cut/'

/**
 * 源图路径 → 抠图产物路径。**纯命名约定**，不碰文件系统。
 *
 * `/cars/bmw-m4-vorsteiner.jpg` → `/cars/cut/bmw-m4-vorsteiner.webp`
 *
 * 后端没有 `cutout` 列，这一列也不该有 —— `public/cars/` 是前端仓库的目录布局，
 * 后端不知道也不需要知道。派生规则写在这里（唯一出处），而不是散在模板里拼字符串。
 */
export function cutoutPathOf(image: string): string | undefined {
  const name = image.split('/').pop()?.replace(/\.[^.]+$/, '')
  return name ? `${CUT_DIR}${name}.webp` : undefined
}

/**
 * 首屏抠图：白名单内的车才返回路径，其余返回 `undefined`（调用方回退到原图）。
 *
 * 取 `images[0]` 而不是「找一张有抠图的」：一台车的抠图只对应主图，
 * 按图集里任意一张去猜会把两个角度的产物张冠李戴。
 */
export function heroCutoutOf(carId: number, images: string[]): string | undefined {
  if (!HERO_ELIGIBLE_IDS.has(carId)) return undefined
  const first = images.find(Boolean)
  return first ? cutoutPathOf(first) : undefined
}

/** `tb_shop.kind` → `VehicleKind`。**缺省视作汽车**，判据与 `car.ts` 的 `kindOf()` 同一口径 */
function toKind(raw?: string | null): VehicleKind {
  return raw === 'motorcycle' ? 'motorcycle' : 'car'
}

/**
 * 分 → 元。四舍五入到整数（二手车报价没有角分）。
 *
 * 用 `Math.round` 而不是 `toFixed`：后端一个字段可能同时被用于比较与展示，
 * 字符串化的价格会让 `sort` 变成字典序（`'98' < '988000'`），是最难查的一类 bug。
 */
function fenToYuan(fen: number): number {
  return Math.round(fen / 100)
}

/**
 * `CarDTO` → `Car`。
 *
 * `brand` 必须由调用方从品牌表带过来：`tb_shop` 只有 `type_id`，
 * 品牌名在 `tb_shop_type` 里，而 `/car/list` **不做 join**（响应里没有品牌名字段）。
 * 传空串表示品牌表查不到 —— UI 上那一行不渲染，好过编一个名字。
 */
export function carFromDTO(dto: CarDTO, brand = ''): Car {
  const images = dto.images
    ? dto.images
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  return {
    id: dto.id,
    name: dto.name,
    brand,
    kind: toKind(dto.kind),
    price: fenToYuan(dto.avgPrice),
    // `null` → `undefined`：模板里 `v-if="car.originalPrice"` 对两者都成立，
    // 但 `Car.originalPrice` 是可选字段，留 `null` 会与「没有这个字段」在类型上分叉
    originalPrice: dto.originalPrice != null ? fenToYuan(dto.originalPrice) : undefined,
    images,
    cutout: heroCutoutOf(dto.id, images),
    mileage: dto.mileage ?? undefined,
    registerDate: dto.registerDate ?? undefined,
    // `gearbox` 只有「自动 / 手动」两个合法值，后端是自由文本列。
    // 这里**不做白名单校验**：出现第三个值时宁可让类型断言漏过去，
    // 也不要静默吞掉 —— 吞掉的表现是「变速箱这一行凭空消失」，查起来毫无线索。
    gearbox: (dto.gearbox as Car['gearbox']) ?? undefined,
    fuel: dto.fuel ?? undefined,
    displacement: dto.displacement ?? undefined,
    ownerCount: dto.ownerCount ?? undefined,
    address: dto.address,
    score: dto.score / 10,
    sold: dto.sold,
    // **后端给的是米，前端要的是公里**（模板里是 `{{ car.distance }} km`）。
    // 不换算的话「674.1382 km 外的车」会出现在首页卡片上，看着像数据错了，
    // 其实是单位错了。留一位小数，与 mock 的口径一致。
    distance: dto.distance != null ? Math.round(dto.distance / 100) / 10 : undefined,
  }
}

/**
 * `BrandDTO` → `Brand`。
 *
 * `mark` 缺失时回退到**空串而不是 `name`**：`mark` 在界面上走 `--font-display`（Oswald），
 * 而 Oswald 没有 CJK 字形，中文名落进去会掉回另一种字体 —— 一行里两种字体比少一行更难看。
 * 详见 CLAUDE.md §1.2。真机上这一列由 `usedcar.sql` 灌满，回退只是防御。
 */
export function brandFromDTO(t: BrandDTO): Brand {
  return { id: t.id, name: t.name, mark: t.mark?.trim() || '' }
}

/**
 * 后端口碑正文里的换行标签 → 一个空格。
 *
 * ── 为什么这算「形状差异」而不是「擅自清洗内容」 ──────────────────────────
 *
 * `Review.content` 的语义**由 mock 定义**：mock 里 7 条全是纯文本，一个标签都没有。
 * 而真机 `tb_blog.content` 是 HTML 片段（实测 4 行里共 40 个 `<br/>` + 29 个 `<br>`，
 * **没有别的标签**）。两边都喂给模板里的 `{{ review.content }}`，
 * 于是真机上用户看到的是**字面的 `<br/>`**：
 *
 *     生活就是一半烟火·一半诗意<br/>手执烟火谋生活·心怀诗意以谋爱·<br/>当然<br/>…
 *
 * 所以「一个字段在两种数据源下含义不同」——这正是适配层存在的理由，
 * 和逗号串→数组、分→元是同一类问题。
 *
 * ⚠️ **这不是一个 sanitizer。** 只处理换行标签，其余标签原样留着 ——
 * 今天的数据里也确实只有 `<br>`。真要渲染富文本（加粗、链接）时，
 * 应该让 M4 直接去用原始的 `ReviewDTO`，而不是把这个函数扩成清洗器：
 * 一个悄悄改写用户内容的适配层，比一个显示得不够漂亮的页面危险得多。
 *
 * 换成**空格**而不是 `\n`：模板里是 `<p>{{ }}</p>`，HTML 默认折叠空白，
 * 产出 `\n` 只会让人以为 CSS 会尊重它（表现为「折行没生效」的困惑）。
 */
function brToSpace(html: string): string {
  return html.replace(/<br\s*\/?>/gi, ' ')
}

/**
 * `ReviewDTO` → `Review`。三处结构差异与 `carFromDTO` 同源（逗号串→数组、平铺→嵌套、HTML→纯文本）。
 *
 * ── 这个函数是补上一个**已经踩到的坑**，不是为了 M4 ──────────────────────
 *
 * `fetchHotReviews` 的真机分支原先直接 `getPage<Review>('/review/hot')` 就返回了，
 * 于是后端那条平铺的 `Review` 被当成 `Review` 用。症状**不是**「口碑区不显示」，
 * 而是首页整个抛一个未捕获的渲染错误：
 *
 *     Cannot read properties of undefined (reading 'nickName')
 *
 * `ReviewFeed` 的 `lead.author.nickName` 读到 `undefined.nickName` 就炸，
 * 于是那一整块 `section` 从 DOM 里消失 —— 页面上看不出是坏了，只少了一块，
 * 控制台里安静地留着一条错误。M1 时期没人发现，因为 `USE_MOCK` 默认开着，
 * 而 mock 的数据本来就是 `Review` 形状（适配层要解决的结构差异在 mock 里不存在）。
 *
 * 口碑区怎么排版、要不要渲染富文本，是 M4 的事；这里只保证它**不炸、也不显示标签**。
 */
export function reviewFromDTO(b: ReviewDTO): Review {
  return {
    id: b.id,
    title: b.title,
    content: brToSpace(b.content ?? ''),
    // 与 `carFromDTO` 用同一套逗号串处理。空串/多余逗号都吃掉，
    // `ReviewFeed` 直接取 `images[0]`，不做防御 —— 形状归一化是本层欠它的。
    images: b.images
      ? b.images
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    liked: b.liked ?? 0,
    comments: b.comments ?? 0,
    createTime: b.createTime ?? '',
    // 昵称/头像缺失时给空串而不是编一个「匿名用户」：界面上那一行空着，
    // 好过显示一个后端并不存在的身份。类型要求 `string`，所以不能留 `undefined`。
    author: {
      id: b.userId,
      nickName: b.name ?? '',
      icon: b.icon ?? '',
    },
  }
}
