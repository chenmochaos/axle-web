import type { Brand, Car, Review, Voucher } from './types'

/**
 * 种子数据。
 *
 * 为什么不直接连后端：`tb_shop` 装的是店铺、也没有车辆扩展字段
 * （`usedcar` 分支尚未创建，2026-10-16 查实，见 CLAUDE.md 顶部）。
 * 这里先给真实形状的数据把界面钉死，等后端数据就绪把 `VITE_USE_MOCK` 设成 false 即可，
 * 接口签名不用动 —— **但真机路径今天会缺字段**，那是后端的工作。
 *
 * **三条素材纪律**（照片是演示素材，但映射到字段上的事实不该是编的）：
 *
 * 1. `images[i]` **每一个**都必须指向 `public/cars/` 下真实存在的文件。指向已删文件的
 *    卡片会静默渲染成一块空图 —— 换素材时这里是要跟着改的，不是「反正 mock 无所谓」。
 * 2. `images` 有多张就是**真图集**，不是凑数：详情页的缩略图条靠它。没有真实的多角度素材
 *    就只放一张，详情页自然不渲染缩略图条 —— 不拿同一张图重复凑成「多图」。
 * 3. `cutout` **只在抠图产物干净可用时给**，因为它唯一的下游是首屏（`HeroSection` 用
 *    `cutout ?? images[0]`，卡片一律用原图）—— 也就是说这个字段的实际语义是
 *    「这台车能上首屏」。脏抠图留在这里等于在数据里说谎，宁可缺。怎么算干净见 car.ts
 *    的 `HERO_CAR_IDS`。2026-10-16 按这条撤掉了 5 台的 `cutout`。
 *
 * 摩托车没有 `gearbox`：`'自动' | '手动'` 是汽车的分类法，摩托是国际挡序列变速箱，
 * 硬塞进这两档是错的数据。它们用 `displacement`（999cc 而不是 3.0T）区分。
 */
export const mockCars: Car[] = [
  // ── 首屏四台（顺序即首屏轮播顺序，见 car.ts 的 HERO_CAR_IDS）──────────────
  // 入选口径只有一条：抠图干净（四张都在深底与浅底上目检过）。为什么是这四台、
  // 以及中途淘汰了谁，写在 car.ts 的 HERO_CAR_IDS 上。
  {
    id: 5,
    name: 'BMW M4 Competition (Vorsteiner)',
    brand: '宝马',
    kind: 'car',
    price: 988_000,
    originalPrice: 1_198_000,
    images: ['/cars/bmw-m4-vorsteiner.jpg'],
    cutout: '/cars/cut/bmw-m4-vorsteiner.webp',
    mileage: 1.4,
    registerDate: '2021-07',
    gearbox: '自动',
    fuel: '汽油',
    displacement: '3.0T',
    ownerCount: 1,
    address: '广东省深圳市南山区科苑南路 2666 号',
    score: 4.7,
    sold: 733,
    distance: 16.8,
  },
  {
    id: 12,
    name: 'Honda CBR1000RR-R Fireblade SP',
    brand: '本田',
    kind: 'motorcycle',
    price: 258_000,
    originalPrice: 319_000,
    images: ['/cars/honda-cbr1000rr-r-fireblade.jpg'],
    cutout: '/cars/cut/honda-cbr1000rr-r-fireblade.webp',
    mileage: 0.6,
    registerDate: '2023-08',
    fuel: '汽油',
    displacement: '1000cc',
    ownerCount: 0,
    address: '江苏省南京市鼓楼区中山北路 2 号',
    score: 4.9,
    sold: 236,
    distance: 18.2,
  },
  {
    id: 10,
    name: 'Mazda MX-5 (ND)',
    brand: '马自达',
    kind: 'car',
    price: 238_000,
    originalPrice: 339_000,
    // 两张是**真的两个角度**：同一次拍摄、同一台车（同轮毂、同尾翼、同侧标、
    // 同背景的白楼与草坪），一张前 3/4 一张侧身。详情页的缩略图条就靠它。
    images: ['/cars/mazda-mx5.jpeg', '/cars/mx5(1).jpeg'],
    cutout: '/cars/cut/mazda-mx5.webp',
    mileage: 1.8,
    registerDate: '2020-05',
    gearbox: '手动',
    fuel: '汽油',
    displacement: '2.0L',
    ownerCount: 1,
    address: '四川省成都市武侯区天府大道 666 号',
    score: 4.6,
    sold: 528,
    distance: 12.4,
  },
  {
    id: 4,
    name: 'CFMoto 675SR',
    brand: '春风动力',
    kind: 'motorcycle',
    price: 45_800,
    originalPrice: 51_800,
    images: ['/cars/cfmoto-675sr.jpeg'],
    cutout: '/cars/cut/cfmoto-675sr.webp',
    mileage: 0.3,
    registerDate: '2024-06',
    fuel: '汽油',
    displacement: '675cc',
    ownerCount: 0,
    address: '浙江省杭州市西湖区文三路 90 号',
    score: 4.9,
    sold: 968,
    distance: 5.1,
  },

  // ── 其余车源 ──────────────────────────────────────────────────────────
  // 下面三台（Manhart / S 1000 RR / AMG GT 63 S）刻意不给 `cutout`：
  // 它们的源图本身就不合格（车间沥青院子 / 地库 / 玻璃幕墙前还停着别的车），
  // u2netp 在 320px 上推理的结果是车轮被平切、抠进地面、把幕墙糊进车身。
  // 卡片用原图没影响；首屏会因此回退到带背景的原图 —— 所以它们不在 HERO_CAR_IDS 里。
  // 要修得换一张背景干净的源图，重跑流水线救不回来（isnet 在这个脚本的预处理下更糟）。
  {
    id: 1,
    name: 'Manhart MH4 GTR II',
    brand: '宝马',
    kind: 'car',
    price: 1_880_000,
    originalPrice: 2_180_000,
    images: ['/cars/manhart-mh4-gtr-ii.jpg'],
    mileage: 0.6,
    registerDate: '2022-05',
    gearbox: '自动',
    fuel: '汽油',
    displacement: '3.0T',
    ownerCount: 0,
    address: '上海市浦东新区世纪大道 8 号',
    score: 4.9,
    sold: 1286,
    distance: 3.2,
  },
  {
    id: 2,
    name: 'BMW S 1000 RR',
    brand: '宝马',
    kind: 'motorcycle',
    price: 168_000,
    originalPrice: 219_000,
    images: ['/cars/bmw-s-1000-rr.jpg'],
    mileage: 0.4,
    registerDate: '2023-04',
    fuel: '汽油',
    displacement: '999cc',
    ownerCount: 0,
    address: '上海市浦东新区世纪大道 8 号',
    score: 4.8,
    sold: 412,
    distance: 3.2,
  },
  {
    id: 3,
    name: 'Mercedes-AMG GT 63 S 4MATIC+',
    brand: '梅赛德斯-AMG',
    kind: 'car',
    price: 1_680_000,
    originalPrice: 2_048_000,
    images: ['/cars/amg-gt-63s.jpg'],
    mileage: 2.1,
    registerDate: '2020-08',
    gearbox: '自动',
    fuel: '汽油',
    displacement: '4.0T',
    ownerCount: 2,
    address: '北京市海淀区中关村大街 1 号',
    score: 4.5,
    sold: 604,
    distance: 21.5,
  },
  {
    id: 6,
    name: 'BMW M4 CSL',
    brand: '宝马',
    kind: 'car',
    price: 1_580_000,
    originalPrice: 1_880_000,
    images: ['/cars/bmw-m4-csl.jpeg'],
    cutout: '/cars/cut/bmw-m4-csl.webp',
    mileage: 0.5,
    registerDate: '2022-11',
    gearbox: '自动',
    fuel: '汽油',
    displacement: '3.0T',
    ownerCount: 0,
    address: '北京市朝阳区建国路 87 号',
    score: 5.0,
    sold: 3421,
    distance: 8.7,
  },
  {
    id: 7,
    name: 'Mercedes-AMG GT Black Series',
    brand: '梅赛德斯-AMG',
    kind: 'car',
    price: 3_680_000,
    originalPrice: 3_980_000,
    images: ['/cars/amg-gt-black-series.jpg'],
    cutout: '/cars/cut/amg-gt-black-series.webp',
    mileage: 0.4,
    registerDate: '2021-09',
    gearbox: '自动',
    fuel: '汽油',
    displacement: '4.0T',
    ownerCount: 0,
    address: '上海市静安区南京西路 1266 号',
    score: 5.0,
    sold: 1877,
    distance: 4.4,
  },
  {
    id: 8,
    name: 'Audi RS6 GT',
    brand: '奥迪',
    kind: 'car',
    price: 1_980_000,
    originalPrice: 2_380_000,
    images: ['/cars/audi-rs6-gt.jpg'],
    // 这一张的源图是奥迪展厅：背景的玻璃幕墙与车身连成一片，抠图把幕墙当成车顶行李架
    // 糊上去了。`--check` 的连通域指标查不出来（是一整块，指标全绿）—— 这正是
    // 「指标是筛子不是法官」的由来。
    mileage: 1.1,
    registerDate: '2023-02',
    gearbox: '自动',
    fuel: '汽油',
    displacement: '4.0T',
    ownerCount: 1,
    address: '浙江省杭州市西湖区文三路 90 号',
    score: 4.8,
    sold: 967,
    distance: 5.1,
  },
  {
    id: 9,
    name: 'Tesla Model S Plaid',
    brand: '特斯拉',
    kind: 'car',
    price: 780_000,
    originalPrice: 1_059_000,
    images: ['/cars/model-s-2.jpg'],
    cutout: '/cars/cut/model-s-2.webp',
    mileage: 2.6,
    registerDate: '2022-01',
    gearbox: '自动',
    fuel: '纯电',
    displacement: null,
    ownerCount: 0,
    address: '上海市闵行区申长路 988 号',
    score: 4.7,
    sold: 2210,
    distance: 9.3,
  },
  {
    id: 11,
    name: 'Mazda3 昂克赛拉',
    brand: '马自达',
    kind: 'car',
    price: 98_000,
    originalPrice: 159_000,
    images: ['/cars/mazda3.jpeg'],
    // 没给 cutout：源图只有 727×393，抠图产物底部有一条背景杂带（轮廓末段宽度不收敛）。
    mileage: 3.4,
    registerDate: '2019-09',
    gearbox: '自动',
    fuel: '汽油',
    displacement: '2.0L',
    ownerCount: 2,
    address: '广东省广州市天河区体育西路 103 号',
    score: 4.4,
    sold: 418,
    distance: 27.9,
  },
  {
    id: 13,
    name: 'Suzuki GSX250R',
    brand: '铃木',
    kind: 'motorcycle',
    price: 18_800,
    originalPrice: 24_800,
    images: ['/cars/suzuki-gsx250r.jpeg'],
    // 没给 cutout：源图是在草地上拍的，抠图底部带进一条 1053px 宽的草地带 ——
    // 白底上看不出来，合成到深底立刻现形（见 car.ts 的检查方法）。
    mileage: 0.9,
    registerDate: '2022-10',
    fuel: '汽油',
    displacement: '248cc',
    ownerCount: 1,
    address: '山东省济南市历下区经十路 100 号',
    score: 4.5,
    sold: 174,
    distance: 31.6,
  },
]

/* ── 购车券（`tb_voucher` + `tb_seckill_voucher`）──────────────────────────
 *
 * 对应后端 `GET /voucher/list/{shopId}`，它是一条 **LEFT JOIN**：普通券（`type = 0`）
 * 在 `tb_seckill_voucher` 里没有行，`stock` / `beginTime` / `endTime` 就是 `null`。
 * 所以下面的 `type = 0` 条目**刻意不写这三个字段** —— 写成 0 或空串是在教前端
 * 「它们总是有值」，然后详情页上就会渲染出 `NaN`。
 *
 * **秒杀的时间窗必须是算出来的，不能硬编码。** 后端在抢购时校验
 * 「当前时间要在 beginTime–endTime 之间」，过期的秒杀在前端会被 `isSeckillLive()`
 * 拦掉。硬编码一个 ISO 日期看着更像真数据，但它会过期 —— 而过期的表现是
 * 「限时特价区块和抢购条静默消失」，不报错、不警告，下次打开就没了。
 * 这里是 mock，永远在售是对的。
 *
 * 时间串用 `YYYY-MM-DDTHH:mm:ss`（不带 `Z`）：Jackson 对 `LocalDateTime` 就是这么序列化的，
 * 带 `Z` 会被 JS 当成 UTC 解析，与后端的本地时间语义差一个时区。
 */
const DAY_MS = 86_400_000
const mockNow = Date.now()

/** 本地时间的 `YYYY-MM-DDTHH:mm:ss`。**不能用 `toISOString()`** —— 那是 UTC，
 *  截掉 `Z` 之后 JS 又会按本地时间解析回来，一来一回差一个时区偏移。 */
const localIso = (t: number) => {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

export const mockVouchers: Voucher[] = [
  // 车 5：一张秒杀券（详情页因此出现底部抢购条）+ 一张普通券
  {
    id: 101,
    shopId: 5,
    title: '限时特价 · 意向金抵 1 万',
    subTitle: '本周限量 50 张，到店核销',
    rules: '到店核销\n可无条件退\n每人限购 1 张\n不与门店其他优惠叠加',
    payValue: 9_900,
    actualValue: 1_000_000,
    type: 1,
    status: 1,
    stock: 50,
    beginTime: localIso(mockNow - 3 * DAY_MS),
    endTime: localIso(mockNow + 7 * DAY_MS),
  },
  {
    id: 102,
    shopId: 5,
    // 普通券：没有 stock / beginTime / endTime
    title: '免费全车检测券',
    subTitle: '含漆膜仪与举升机检测',
    rules: '需提前 1 天预约\n单次到店有效',
    payValue: 0,
    actualValue: 68_000,
    type: 0,
    status: 1,
  },

  // 车 12：另一张秒杀券 —— 首屏第二台，验证抢购条不是只对某一台生效
  {
    id: 103,
    shopId: 12,
    title: '限时特价 · 骑行装备金抵 5000',
    subTitle: '限量 200 张',
    rules: '到店核销\n可无条件退\n每人限购 1 张',
    payValue: 5_000,
    actualValue: 500_000,
    type: 1,
    status: 1,
    stock: 200,
    beginTime: localIso(mockNow - DAY_MS),
    endTime: localIso(mockNow + 14 * DAY_MS),
  },

  // 车 10：**只有普通券**，没有秒杀 —— 详情页应当渲染券区块但**不出抢购条**。
  // 这一条是为「有券但不该出抢购条」这个分支留的：两三种状态各要有一台真车兜住，
  // 否则那个 `v-if` 分支从没被人眼看过。
  {
    id: 104,
    shopId: 10,
    title: '首年延保抵扣券',
    subTitle: '抵 3000 元延保费用',
    rules: '随车购买延保时抵扣\n不可折现',
    payValue: 19_900,
    actualValue: 300_000,
    type: 0,
    status: 1,
  },
]

/**
 * `count` 是**平台在售总量**，不是本文件里 mockCars 的条数 —— 这里是 13 台样车，
 * 导航上写「BMW · 214」说的是平台上有 214 台宝马，两回事。
 * `kinds` 不写在这：它由 `fetchBrands()` 从 mockCars 现算（见 car.ts），
 * 写死一份必然和车源表漂移。
 */
export const mockBrands: Brand[] = [
  { id: 1, name: '宝马', mark: 'BMW', count: 214 },
  { id: 2, name: '梅赛德斯-AMG', mark: 'AMG', count: 96 },
  { id: 3, name: '奥迪', mark: 'AUDI', count: 176 },
  { id: 4, name: '特斯拉', mark: 'TESLA', count: 88 },
  { id: 5, name: '马自达', mark: 'MAZDA', count: 132 },
  { id: 6, name: '本田', mark: 'HONDA', count: 74 },
  { id: 7, name: '铃木', mark: 'SUZUKI', count: 58 },
  { id: 8, name: '春风动力', mark: 'CFMOTO', count: 41 },
]

export const mockReviews: Review[] = [
  {
    id: 1,
    title: '提车 Manhart MH4 GTR II，从验车到过户的全过程',
    content:
      '看了三台车，最后选了这台 2022 款。第三方检测报告显示原版原漆，四轮定位数据正常。分享几个验车要点：漆膜仪打一圈、冷车启动听声音、查保养记录和出险记录。',
    images: ['/cars/manhart-mh4-gtr-ii.jpg'],
    liked: 1284,
    comments: 96,
    createTime: '2026-10-12T14:20:00',
    author: { id: 11, nickName: '老陈说车', icon: '' },
  },
  {
    id: 2,
    title: 'AMG GT Black Series 半年用车报告',
    content:
      '赛道日和日常通勤都跑过。悬挂在舒适模式下比想象中好，但离地间隙确实是硬伤，地库要挑。油耗市区 18L 左右，赛道日另算。',
    images: ['/cars/amg-gt-black-series.jpg'],
    liked: 892,
    comments: 143,
    createTime: '2026-10-10T09:05:00',
    author: { id: 12, nickName: 'Track Day', icon: '' },
  },
  {
    id: 3,
    title: 'M4 CSL 第一次下赛道：轻量化到底轻在哪',
    content:
      '拆掉后排和隔音之后，车尾的动态比 Competition 干净得多。钛合金排气在 4000 转以上才开始有声音。附上原厂减重清单和各部件实测重量。',
    images: ['/cars/bmw-m4-csl.jpeg'],
    liked: 2056,
    comments: 218,
    createTime: '2026-10-08T20:41:00',
    author: { id: 13, nickName: '弯道快才是真的快', icon: '' },
  },
  {
    id: 4,
    title: 'Model S Plaid 两年四万公里，电池衰减实测',
    content:
      '满电续航从提车时的 637km 掉到现在 601km，衰减 5.6%。日常家充为主，快充占比不到两成。附上完整的充电记录表。',
    images: ['/cars/model-s-2.jpg'],
    liked: 1447,
    comments: 187,
    createTime: '2026-10-04T16:12:00',
    author: { id: 14, nickName: '电量焦虑患者', icon: '' },
  },
  {
    id: 5,
    title: 'S 1000 RR 提车第一周：从仿赛新手到跑完一趟山路',
    content:
      '电控给得很足，弯道 ABS 和防翘头在第一天就救了我两次。提醒同样从零开始的朋友：先练习低速绕桩，别急着上大排量的油。',
    images: ['/cars/bmw-s-1000-rr.jpg'],
    liked: 934,
    comments: 121,
    createTime: '2026-10-02T08:55:00',
    author: { id: 15, nickName: '两个轮子', icon: '' },
  },
  {
    id: 6,
    title: '春风 675SR 三千公里长测：国产三缸值不值',
    content:
      '三缸的声浪和双缸完全两回事，中段扭矩很饱满。首保的时候发现链条略松，其余没毛病。这个价位能给到的配置单，进口车做不到。',
    images: ['/cars/cfmoto-675sr.jpeg'],
    liked: 1673,
    comments: 254,
    createTime: '2026-09-30T19:12:00',
    author: { id: 16, nickName: '摩托范儿', icon: '' },
  },
  {
    id: 7,
    title: '验车报告：一台「原版原漆」的 GT 63 S 是怎么被识破的',
    content:
      '漆膜仪在右后翼子板读到 320μm，明显高于原厂 110μm。举升机下看到纵梁有轻微校正痕迹，卖家最终承认有过剐蹭。',
    images: ['/cars/amg-gt-63s.jpg'],
    liked: 3128,
    comments: 402,
    createTime: '2026-09-29T19:30:00',
    author: { id: 17, nickName: '第三方检测员', icon: '' },
  },
]
