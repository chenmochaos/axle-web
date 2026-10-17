# AXLE 项目导读

> 这份文档的目标：**让你在 30 分钟内建立完整的项目心智模型** —— 知道每一层在哪、
> 数据怎么流、为什么这么设计、以及哪些地方有坑。
>
> 快速启动看根 [`README.md`](README.md)；改代码前必读的硬约束分别在
> [`web/CLAUDE.md`](web/CLAUDE.md)（前端）和 [`server/CLAUDE.md`](server/CLAUDE.md)（后端）。
> 接口逐条清单在 [`server/docs/API.md`](server/docs/API.md)。

---

## 1. 一分钟版本

AXLE 是一个**二手车交易平台**：

- 车源浏览（品牌 / 大类 / 城市附近 / 关键词搜索）
- 手机号验证码登录，Redis token 滑动续期
- 车辆详情（缓存 + 逻辑过期）、限时特价（秒杀 + 一人一单）
- 口碑（发布 / 点赞 / 排行榜 / 详情）
- 关注与关注流（Feed）
- 车商主页、个人中心、连续签到
- 图片上传

它的数据模型与后端能力来自**黑马点评（hmdp）Redis 教程**。我们把同一批 Redis 能力
接到了「二手车」这个语义上：

| 教程语义 | 本项目语义 | 为什么成立 |
|---|---|---|
| 商铺 `Shop` | 车源 `Car` | 一辆车一条记录 |
| 商铺分类 `ShopType` | 品牌 `Brand` | 宝马 / 奥迪 / 特斯拉…… |
| 探店笔记 `Blog` | 口碑 `Review` | 车主 / 车商发布用车体验 |
| 代金券 / 秒杀券 | 购车意向金 / 限时特价 | **一辆车只能卖给一个人**，一人一单天然自洽 |
| 附近商铺 GEO | 附近车源 | 同城找车 |

**核心取舍：只改语义，不改存储契约。** 数据库表名仍是教程的 `tb_shop` / `tb_blog`，
接口响应结构也尽量保持不变。类名与表名靠 `@TableName` 解耦。理由见 §6.1。

---

## 2. 技术栈与总体架构

### 2.1 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3.5（`<script setup>`）、Vite 8、TypeScript（strict）、Pinia、Vue Router 5 |
| 样式与动效 | Tailwind CSS v4（`@theme`）、GSAP 3.15（含 ScrollTrigger / Flip / SplitText）、Lenis |
| 前端测试 | Vitest 5（jsdom） |
| 后端 | Spring Boot 2.7.4 / Spring 5.3.23、MyBatis-Plus 3.5.2、Redisson 3.17.7 |
| 存储 | MySQL 8.4、Redis 8.0.5（Lettuce 客户端） |
| 构建 | pnpm（前端）、Maven（后端）；编译目标 Java 8，实际运行 JDK 21/25 |

### 2.2 运行时结构

```
┌──────────────────────────── Browser ────────────────────────────┐
│  Vue SPA (web/)                                                 │
│  views → api/*.ts → axios 实例 (client.ts)                      │
│                     │                                           │
│            USE_MOCK ? ──是──→ mock.ts / mockSocial.ts（内存）    │
│                     │否                                         │
└─────────────────────┼───────────────────────────────────────────┘
                      │ HTTP /api/*
                      ▼
        ┌─────────────────────────────┐
        │ Vite dev proxy (5173/5174)  │  生产：pnpm build:embed →
        │   /api → 127.0.0.1:8081     │  产物进 server/src/main/resources/static
        │   /imgs → 127.0.0.1:8081    │  由 Spring Boot 单进程托管
        └──────────────┬──────────────┘
                       ▼
┌──────────────────── Spring Boot (server/, 8081) ────────────────────┐
│ RefreshTokenInterceptor (order 0, /**)                              │
│   └─ 读 authorization 头 → login:token:{token} → UserHolder + 续期  │
│ LoginInterceptor (order 1, 白名单之外全部拦)                        │
│   └─ UserHolder 为空 → 裸 401 + 空 body                            │
│ Controller → Service → Mapper(MyBatis-Plus) → MySQL                 │
│                     └→ StringRedisTemplate / Redisson → Redis       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 两种数据源

| 模式 | 命令 | 数据来自 |
|---|---|---|
| mock（默认） | `pnpm dev` | `src/api/mock.ts` + `src/api/mockSocial.ts`，不需要后端 |
| 真机 | `VITE_USE_MOCK=false pnpm dev --port 5174` | 8081 上的 Spring Boot |

`USE_MOCK` **只在 `src/api/client.ts` 读一次**，其余模块一律 import 它。
两条路径的分叉不只在数据内容，更在**形状**（真机是逗号串、平铺作者、没有 `total`），
所以改接口必须两种模式都验。

---

## 3. 目录结构

```
axle-web/
├── README.md                 快速开始
├── PROJECT_GUIDE.md          ← 本文
├── CLAUDE.md                 仓库级规则（结构 / 边界 / 验证 / 红线）
├── docs/                     产品级文档
│   ├── specs/                设计 spec（视觉、动效、数据模型）
│   ├── plans/                里程碑实施计划
│   └── screenshots/
│
├── web/                      Vue 前端
│   ├── CLAUDE.md             前端硬约束（零彩色 UI、动效、data-reveal 纪律）
│   ├── index.html
│   ├── vite.config.ts        /api 与 /imgs 代理
│   ├── public/
│   │   ├── cars/             车辆原图 + cut/*.webp 抠图
│   │   └── types/
│   └── src/
│       ├── api/              client / adapt / car / review / social / user / order
│       │                     / mock / mockSocial / types
│       ├── components/
│       │   ├── ui/           AppButton / AppField / AppTag / SkeletonBlock / StatCount
│       │   └── business/     HeroSection / CarCard / ReviewFeed / ReviewCard …
│       ├── composables/      useCountUp / useReveal / useCountdown / useScrollTo
│       │                     / useRequireLogin
│       ├── layouts/          SiteLayout（全站唯一布局）
│       ├── lib/              gsap / lenis / intro 单例，flip / time / fit / phone / carName
│       ├── router/           index.ts（路由表）
│       ├── stores/           auth.ts（项目唯一的 Pinia store）
│       ├── styles/           tokens.css + main.css
│       ├── test/             测试 setup
│       └── views/            13 个页面（见 §4.2）
│
└── server/                   Spring Boot 后端
    ├── CLAUDE.md             后端规则（教程基线 / 接口 / Redis key / 脚本顺序）
    ├── docs/API.md           接口清单
    ├── pom.xml
    ├── schema.sql            教程原始建表（11 张表）
    ├── usedcar.sql           二手车数据迁移（幂等、不删行；含口碑内容改写）
    ├── cleanup-test-data.sql 本地开发库测试残留清理（**会删行**）
    ├── scripts/
    │   ├── init-car-geo.sh       GEO 索引
    │   ├── init-seckill-stock.sh 秒杀库存
    │   └── init-car-cache.sh     车辆详情缓存（顺序关键）
    ├── uploads/imgs/         运行时上传目录（gitignored，默认不存在）
    └── src/main/
        ├── java/com/axle/
        │   ├── AxleApplication.java
        │   ├── config/       MvcConfig / MybatisConfig / RedissonConfig / WebExceptionAdvice
        │   ├── controller/   9 个 Controller
        │   ├── dto/          Result / UserDTO / UserProfileDTO / ScrollResult
        │   ├── entity/       10 个实体（@TableName 映射教程表）
        │   ├── interceptor/  RefreshTokenInterceptor / LoginInterceptor
        │   ├── mapper/       MyBatis-Plus Mapper
        │   ├── service/      接口 + impl
        │   └── utils/        CacheClient / RedisConstants / RedisIdWorker / SimpleRedisLock
        └── resources/
            ├── application.yaml
            ├── mapper/*.xml          （含全限定类名，改名要手动同步）
            ├── seckill.lua           秒杀原子脚本
            └── unlock.lua
```

---

## 4. 前端架构

### 4.1 分层与职责

```
views/              页面编排：取数、状态、空态/错误态
  ↓ 使用
components/business + components/ui     展示与交互
  ↓ 调用
composables/        复用行为（入场动画、数字滚动、登录守卫）
  ↓ 调用
api/                唯一的数据访问层
  ├─ client.ts      axios 实例；USE_MOCK 的唯一读者；401 统一处理
  ├─ adapt.ts       后端 DTO → 展示模型的唯一映射点
  ├─ mock*.ts       内存数据源
  └─ *.ts           每个业务一组函数
```

**三条边界**（违反了会静默出错）：

1. **`adapt.ts` 是唯一允许做字段映射的地方。**
   `avgPrice` 分→元、`score` ÷10、`images` 逗号串→数组、平铺作者→嵌套 `author`、
   抠图路径推导，全在这一个文件。组件里写 `/100` 或 `as unknown as string[]`
   等于把这一层架空。
2. **`Car` / `Brand` / `Review` 是展示模型，不要兼容后端形状。**
   别把 `images` 声明成 `string | string[]` —— 那会把「有两种形状」推给每个读类型的人。
3. **401 的处理挂在 `main.ts` 注入的 handler 上，不在 `client.ts` import router。**
   `router → views → api` 会成环，所以由 `main.ts` 单向下行注入。

### 4.2 路由表

| 路径 | 视图 | 登录 | 说明 |
|---|---|---|---|
| `/` | `HomeView` | — | 首屏、品牌导航、精选车源、热门口碑 |
| `/cars/:brand?` | `CarListView` | — | 车源列表，支持品牌 / 大类 / GEO 附近 |
| `/car/:id` | `CarDetailView` | — | 车辆详情、参数、特价券 |
| `/seckill/:id` | `SeckillView` | 下单需登录 | **`:id` 是车 id，不是券 id** |
| `/review` | `ReviewListView` | — | 口碑广场（按点赞降序） |
| `/review/edit` | `ReviewEditView` | ✅ | 发布口碑（必须排在 `/review/:id` 前） |
| `/review/:id` | `ReviewDetailView` | — | 口碑详情、点赞、点赞榜 |
| `/feed` | `FeedView` | ✅ | 关注流，游标分页 |
| `/dealer/:id` | `DealerView` | — | 车商 / 用户公开主页 |
| `/login` | `LoginView` | — | 手机号验证码登录 |
| `/me` | `MeView` | ✅ | 个人中心、签到、我的口碑 |
| `/me/edit` | `MeEditView` | ✅ | 改昵称 / 头像 |
| `/:pathMatch(.*)*` | `PlaceholderView` | — | 404 |

两个路由级细节：

- **`/review/edit` 必须写在 `/review/:id` 之前**，否则 `edit` 会被当成 id。
- **router 里没有 `scrollBehavior`**，这是故意的：它走 `window.scrollTo`，
  Lenis 的 `targetScroll` 不会跟着变；滚动归零由 `App.vue` 在转场 `@after-leave` 时驱动 Lenis。

### 4.3 状态管理

**项目只有一个 Pinia store：`stores/auth.ts`。** 判据是「这份状态要不要驱动别的组件重渲染」：

- 要 → Pinia（登录态驱动 header 换昵称 / 头像）
- 不要 → `lib/` 模块单例（gsap / lenis / intro）

`auth` 暴露：`token`、`user`、`login()`、`logout()`（**async**，先删服务端 token 再清本地）、
`fetchMe()`、`applyUser()`。

### 4.4 mock 的两层

| 文件 | 性质 |
|---|---|
| `api/mock.ts` | 静态种子：13 台车、8 个品牌、坐标、券、初始口碑 |
| `api/mockSocial.ts` | **有状态**：点赞、关注、签到、发口碑、改资料都会改内存 |

`mockSocial.ts` 必须镜像真机语义，否则「mock 通过、真机出错」：

- 点赞是**切换**，不是累加
- 同一天重复签到**幂等**
- 重复关注不翻倍，不能关注自己
- Feed 游标是 `(lastId=maxScore, offset)`，不能改写成页码

### 4.5 设计系统与动效（只需知道边界）

- **零彩色 UI**：界面没有品牌色 / 红绿状态色，唯一色彩来源是车辆照片；层次靠明度。
- **全站纯白底**，语义 token（`bg-bg` / `text-fg` / `border-line`）。
- **Lenis 是单例**，组件里永远不要 `new Lenis()`。
- **`data-reveal` 必须配 `useReveal`**：CSS 给的初始 `opacity: 0` 只有 JS 能揭开，
  漏配的表现是元素永久隐形且不报错。`useReveal.spec.ts` 会静态扫描所有 `.vue` 守着这条。

细节见 [`web/CLAUDE.md`](web/CLAUDE.md)。

---

## 5. 后端架构

### 5.1 分层

```
controller/    只做参数接收与响应包装，业务逻辑不落地
service/       IXxxService 接口
service/impl/  业务实现；事务、Redis、跨服务编排都在这一层
mapper/        MyBatis-Plus BaseMapper；复杂 SQL 在 resources/mapper/*.xml
entity/        @TableName 映射数据库表
dto/           Result / UserDTO / UserProfileDTO / ScrollResult
config/        拦截器注册、MyBatis-Plus、Redisson、全局异常
interceptor/   两个拦截器（见下）
utils/         CacheClient / RedisConstants / RedisIdWorker / 简单分布式锁
```

### 5.2 认证链路（必须记住）

```
请求
 ├─ RefreshTokenInterceptor  (order 0, /**)
 │    读请求头 `authorization`（全小写）
 │    查 Redis Hash `login:token:{token}`
 │    有 → 写入 ThreadLocal UserHolder，并把 TTL 续到 30 分钟
 │    无 / 空 → 直接放行（不拦）
 │
 ├─ LoginInterceptor         (order 1, 默认 /**)
 │    UserHolder 为空 → response.setStatus(401)，不写 body
 │    白名单路径 → 放行
 │
 └─ Controller / Service
       ↓
    afterCompletion 清理 ThreadLocal
```

**白名单**（`config/MvcConfig.java`）是写死的路径字符串，不含领域词：

```
/user/code  /user/login  /user/logout  /user/profile/*  /review/hot
/review/*  /review/likes/*  /review/of/user
/car/**  /brand/**  /upload/**  /imgs/**  /voucher/**  /error
```

三个最容易写错的地方：

1. **`/user/profile/*` 必须是单星号。** 写成 `/**` 会连 `PUT /user/profile`
   （无尾段）一起放行，改资料就不需要登录了。
2. **`/error` 不能删。** Spring 把未捕获异常转发到 `/error` 会再走一遍拦截器；
   不排除的话任何 500 / 缺参数都会被改写成 401，真实原因被吞掉。
3. **改了 Controller 路径必须同步改白名单。** 编译不会报错，表现是公开接口全部 401。

### 5.3 统一响应

```json
{ "success": true, "errorMsg": null, "data": ..., "total": null }
```

- 列表接口走 `Result.ok(list)`，**`total` 恒为 `null`**；「还有下一页」只能按满页推。
- 未登录是**裸 401 + 空 body**，不要解析 body 判断登录态。

### 5.4 Controller 清单

| Controller | 路径前缀 | 说明 |
|---|---|---|
| `CarController` | `/car` | 详情、列表、搜索、增改 |
| `BrandController` | `/brand` | 品牌列表 |
| `ReviewController` | `/review` | 发布 / 详情 / 点赞 / 榜单 / 我的 / 关注流 |
| `ReviewCommentController` | `/review-comments` | **空壳**，评论后端未实现 |
| `FollowController` | `/follow` | 关注 / 取关 / 是否关注 / 共同关注 |
| `UserController` | `/user` | 验证码、登录、登出、资料、签到 |
| `VoucherController` | `/voucher` | 券列表、新增普通券 / 秒杀券 |
| `VoucherOrderController` | `/voucher-order` | 秒杀下单 |
| `UploadController` | `/upload` | 图片上传 / 删除；`/imgs/**` 静态访问 |

---

## 6. 数据库设计

### 6.1 三层命名：为什么表名不改

| 层 | 词汇 | 例子 |
|---|---|---|
| 前端展示模型 | `Car` / `Brand` / `Review` | `web/src/api/types.ts` |
| 后端领域类 / 接口 | `Car` / `Brand` / `Review` | `GET /car/{id}` |
| 数据库 | `tb_shop` / `tb_shop_type` / `tb_blog` | 教程原始 schema |

10 个实体**全部**显式写了 `@TableName`，类名与表名解耦。保留表名的理由：

- 教程的 `schema.sql` 仍然有效，能与 upstream 对照；
- 重命名表 / 列会让 `schema.sql`、`usedcar.sql`、实体、文档四处同时失效，
  而收益只是「名字好看」。

**加列可以，重命名表或列不行。** `usedcar.sql` 就是这样给 `tb_shop` 加了 8 列。

### 6.2 11 张表

#### `tb_shop` — 车源（14 行）

| 列 | 含义 | 备注 |
|---|---|---|
| `id` | 主键 | 与前端 mock 车 id 一一对应（1–13） |
| `name` | 车源名称 | 如 `BMW M4 CSL` |
| `type_id` | 品牌 id | → `tb_shop_type.id` |
| `images` | 图片 URL | **逗号串**，前端 `adapt.ts` 拆数组 |
| `area` / `address` | 商圈 / 地址 | 详情页显示 address |
| `x` / `y` | 经纬度 | 写入 Redis GEO |
| `avg_price` | 售价，**单位分** | 适配层 ÷100 |
| `sold` / `comments` | 销量 / 评论数 | ZEROFILL 整型 |
| `score` | 评分 **×10** | 4.9 分存 49 |
| `open_hours` | 原「营业时间」 | 二手车未使用 |
| **`mileage`** | 里程（万公里） | 扩展列 |
| **`register_date`** | 上牌时间 `YYYY-MM` | 扩展列 |
| **`gearbox`** | 自动 / 手动 | 摩托车为 NULL |
| **`fuel`** | 汽油 / 纯电 / 混动 | 扩展列 |
| **`displacement`** | 排量 | 纯电为 NULL |
| **`owner_count`** | 过户次数 | 扩展列 |
| **`kind`** | `car` / `motorcycle` | 首页大类 tab 的承重字段 |
| **`original_price`** | 新车指导价，**单位分** | 卡片「新车指导价」 |

> 加粗 8 列由 `usedcar.sql` 幂等添加（先查 `information_schema` 再 ALTER）。

#### `tb_shop_type` — 品牌（10 行）

`id` / `name`（中文名）/ `icon` / `sort` / **`mark`**（拉丁字标，如 `BMW`）/ 时间列。

id 9、10（保时捷 / 沃尔沃）**没有车源** —— 这是「不删行」的代价，点进去是空态。

#### `tb_blog` — 口碑（4 行种子）

| 列 | 含义 |
|---|---|
| `id` / `user_id` / **`shop_id`** | `shop_id` 在实体里映射为 `carId` |
| `title` / `content` / `images` | 标题 / 正文 / 逗号串图片 |
| `liked` | 点赞数（真值在 Redis ZSET，DB 同步增减） |
| `comments` | 评论数（评论功能未实现） |
| `create_time` / `update_time` | 发布 / 更新时间 |

> 4 条种子口碑的标题、正文、配图与关联车源已由 `usedcar.sql` §4 改写成二手车内容，
> 配图指向 `web/public/cars/` 下真实存在的文件。

#### `tb_blog_comments` — 口碑评论（空表）

字段齐全（`parent_id` / `answer_id` / `status`），但 Controller 是空壳，**功能未实现**。

#### `tb_follow` — 关注关系

`id` / `user_id`（关注者）/ `follow_user_id`（被关注者）/ `create_time`。
Redis Set `follows:{userId}` 是查询侧索引，DB 是持久化真相。

#### `tb_user` — 用户

`id` / `phone`（唯一索引 `uniqe_key_phone`）/ `password` / `nick_name` / `icon` / 时间列。
验证码登录时手机号不存在会自动建号，昵称默认 `user_<随机串>`。

#### `tb_user_info` — 用户扩展资料（空表）

`city` / `introduce` / `fans` / `followee` / `gender` / `birthday` / `credits` / `level`。
**当前实现没有读写这张表**：粉丝数 / 关注数 / 口碑数都由 `tb_follow`、`tb_blog`
实时 `COUNT`（见 `UserServiceImpl#queryProfile`）。

#### `tb_voucher` — 购车券（5 张在架）

`id` / `shop_id`（→ 车 id）/ `title` / `sub_title` / `rules` /
`pay_value`（支付金额，分）/ `actual_value`（抵扣金额，分）/ `type`（0 普通，1 秒杀）/
`status`（1 上架，2 下架，3 过期）。

| id | 车 | 类型 | 用途 |
|---|---|---|---|
| 101 | 5 | 秒杀 | 正在进行 |
| 102 | 5 | 普通 | 有券但不出抢购条 |
| 103 | 12 | 秒杀 | 正在进行 |
| 104 | 10 | 普通 | MX-5 只有普通券 |
| 105 | 3 | 秒杀 | **时间窗已结束**，演示「已结束」态 |

#### `tb_seckill_voucher` — 秒杀扩展（与券一对一）

`voucher_id` / `stock` / `begin_time` / `end_time` / 时间列。
MySQL 的 `stock` 是真相副本，**实际扣减发生在 Redis `seckill:stock:{voucherId}`**。

#### `tb_voucher_order` — 秒杀订单

`id`（雪花 ID，由 `RedisIdWorker` 生成）/ `user_id` / `voucher_id` /
`pay_type` / `status` / 各时间列。

#### `tb_sign` — 签到表（未使用）

字段齐全，但签名实现**只写 Redis Bitmap**，不落这张表。

### 6.3 数据分布

- 车源 14 台：上海 5（1/2/3/7/9）、北京 5（6/11/12/13/14）、深圳 4（4/5/8/10）
- 品牌 10 个，其中 9/10 无车源（空态演示）
- 在架券 5 张，秒杀行 3 条（另有 1 条已下架券的遗留行）
- 口碑 4 条，作者为种子用户 1 / 2，分别关联车源 9 / 5 / 10 / 13
- 真机 14 台 / mock 13 台：差的是 `BMW M 1000 RR`（`tb_shop` 本来就有 14 行，不删就填满）

坐标刻意集中在 3 个城市，因为 `/car/list` 的 GEO 半径**硬编码 5 km**。
代价是这 3 城之外的定位查出来是空的（前端有空态文案，不静默降级）。

---

## 7. Redis 设计

### 7.1 key 总表

| Key | 结构 | TTL | 用途 |
|---|---|---|---|
| `login:code:{phone}` | String | 2 分钟 | 登录验证码 |
| `login:token:{token}` | Hash（id / nickName / icon） | 30 分钟，滑动续期 | 登录态 |
| `cache:car:{id}` | String（`RedisData` JSON） | 无物理 TTL，逻辑过期 30 分钟 | 车辆详情 |
| `lock:car:{id}` | String（`SETNX`） | 10 秒 | 缓存重建互斥锁 |
| `cache:brand` | List（每个元素一条 Brand JSON） | 无 TTL | 品牌列表 |
| `car:geo:{typeId}` | GEO | 无 | 按品牌分片的坐标索引 |
| `car:geo:all` | GEO | 无 | 全量坐标索引（不筛品牌时用） |
| `seckill:stock:{voucherId}` | String | 无 | 秒杀库存 |
| `review:liked:{reviewId}` | ZSET（member=userId，score=点赞时间） | 无 | 点赞集合 / 排行榜 |
| `feed:{userId}` | ZSET（member=reviewId，score=发布时间戳） | 无 | 关注流收件箱 |
| `follows:{userId}` | SET（member=followUserId） | 无 | 关注关系索引 / 交集 |
| `sign:{yyyy:MM:}{userId}` | Bitmap（bit = 当月第几天） | 无 | 签到 |
| `stream.orders` | Stream（group `g1`，consumer `c1`） | 无 | 秒杀订单异步队列 |

> `login:code:` 与 `login:token:` **绝对不能改名** —— 改了会让所有已登录用户静默掉线。

### 7.2 各功能用到的机制

| 功能 | Redis 能力 | 关键点 |
|---|---|---|
| 登录 | String + Hash | 验证码 2 分钟；token 30 分钟滑动续期 |
| 品牌列表 | List | 整表缓存，无 TTL；改库后需手动清 `cache:brand` |
| 车辆详情 | String + 逻辑过期 + 互斥锁 | **冷缓存直接返回 null，不回查数据库** |
| 附近车源 | GEO | 半径硬编码 5 km；按 typeId 分片 + 全量索引 |
| 秒杀 | Lua + Stream + 雪花 ID | 原子判断库存 / 一人一单 / 扣减，异步入库 |
| 点赞 | ZSET | 切换式；Top5 用 `range(0,4)` |
| 关注流 | ZSET | 发布时推送到每个粉丝的 `feed:{userId}` |
| 关注关系 | SET | 共同关注 = 两个 Set 的 `intersect` |
| 签到 | Bitmap | `BITFIELD` 取本月截至今天的位，从低位往前数连续 1 |

**逻辑过期的语义**（最容易踩）：

`CacheClient.queryWithLogicalExpire` 在 key 不存在时**直接返回 null**，
不回查数据库（假设缓存已被预热）。所以：

- 冷启动 / Redis 重启 / 手动删过 `cache:car:*` → `GET /car/{id}` 全部「车源不存在」
- 必须跑 `server/scripts/init-car-cache.sh`
- 逻辑过期到点后，下一次读会拿 `lock:car:{id}` 异步回源重建，之后自维持

---

## 8. 关键数据流

### 8.1 登录

```
POST /user/code?phone=138xxxx
  → Redis SET login:code:{phone} = 6 位码, EX 120
  → 后端只 log.debug 打印（没有短信网关；真机调试用 redis-cli 取）

POST /user/login {phone, code}
  → 校验码（比对后删除）
  → 按 phone 查 tb_user；不存在则自动建号
  → token = UUID（去横线）
  → Redis HSET login:token:{token} id/nickName/icon, EX 1800
  → 返回裸 token 字符串
GET /user/me（带 authorization）→ 返回 UserDTO
```

### 8.2 车辆详情（缓存）

```
GET /car/{id}
  → GET cache:car:{id}
     命中且未逻辑过期 → 直接返回
     命中但已逻辑过期 → 返回旧值，同时抢 lock:car:{id}
                        → 抢到则开线程查 MySQL、setWithLogicalExpire 覆盖
     未命中 → 返回 null → "车源不存在"（不回查数据库）
```

### 8.3 车源列表（GEO）

```
GET /car/list?typeId=&kind=&current=&x=&y=
  无 x/y → MySQL 分页（typeId / kind 可选，ORDER BY id）
  有 x/y → Redis GEOSEARCH car:geo:{typeId} 或 car:geo:all
           WITHIN 5 km, WITHDIST, COUNT=current*10
           → 内存分页切片 → 按距离顺序回查 MySQL
           → kind 在 SQL 层过滤
```

### 8.4 秒杀（一人一单）

```
POST /voucher-order/seckill/{voucherId}
  → seckill.lua（原子执行）
      1. 库存不足？        → code 1
      2. 当前用户已下单？  → code 2
      3. 库存未预热？      → code 3
      否则：stock-1、SADD 用户、XADD stream.orders
  → 返回 RedisIdWorker 生成的订单 id
后台线程：XREADGROUP stream.orders → 创建 VoucherOrder → MySQL 落库 → ACK
```

**返回订单 id ≠ 已落库。** 前端不能拿返回值立刻查订单。

### 8.5 发布口碑 → 粉丝 Feed

```
POST /review {title, content, images, carId}
  → 校验标题 / 正文非空
  → 写入 tb_blog（images 存逗号串）
  → 查出作者的粉丝列表
  → 对每个粉丝 ZADD feed:{粉丝id} score=now member=reviewId
  → 返回 reviewId

GET /review/of/follow?lastId=&offset=
  → ZREVRANGEBYSCORE feed:{me} [0, lastId] LIMIT offset 5
  → 返回 {list, minTime, offset}
  → 下一页原样回传 minTime 与 offset
```

### 8.6 关注 / 签到 / 上传

```
PUT /follow/{id}/{isFollow}
  → 自关注拒绝
  → 关注：DB 查重后 INSERT tb_follow，SADD follows:{me} {id}
  → 取关：DELETE tb_follow，SREM follows:{me} {id}

POST /user/sign
  → key = sign:{yyyy:MM:}{me}，SETBIT 第 (日-1) 位
  → 同一天重复调用幂等
GET /user/sign/count
  → BITFIELD 取本月截至今天的位，从最后一位往前数连续 1 的个数

POST /upload/review (multipart file)
  → 写入 uploads/imgs/reviews/{d1}/{d2}/{uuid}.{ext}
  → 返回 /imgs/reviews/...
GET /imgs/** → MvcConfig 的 ResourceHandler 直接读真实目录
```

---

## 9. 本地启动

### 9.1 首次

```bash
# 1. 建库 + 教程原始表
mysql -udev -e "CREATE DATABASE IF NOT EXISTS hmdp DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_general_ci;"
mysql -udev hmdp < server/schema.sql

# 2. 密码（server/.env，已在 .gitignore）
printf 'MYSQL_PASSWORD=<本机密码>\n' > server/.env

# 3. 二手车数据（幂等；必须用 mysql 客户端，脚本用了 DELIMITER）
cd server
mysql -udev -p"$MYSQL_PASSWORD" hmdp < usedcar.sql

# 4. （可选）清掉测试 / 压测残留账号，只保留 5 个种子用户
mysql -udev -p"$MYSQL_PASSWORD" hmdp < cleanup-test-data.sql
```

### 9.2 每次 Redis 重启 / 清缓存后

```bash
cd server
./scripts/init-car-geo.sh
./scripts/init-seckill-stock.sh
./scripts/init-car-cache.sh     # 必须放在验证详情页之前
```

### 9.3 日常

```bash
# 后端
cd server && mvn spring-boot:run          # 8081

# 前端（另开终端）
cd web && pnpm install
pnpm dev                                  # 5173，mock 模式
VITE_USE_MOCK=false pnpm dev --port 5174  # 真机模式
```

真机验证码：

```bash
redis-cli get login:code:<手机号>
```

### 9.4 单进程托管（可选）

```bash
cd web && pnpm build:embed     # 产物进 server/src/main/resources/static（gitignored）
cd ../server && mvn package    # jar 直接托管整个站点
```

---

## 10. 验证与测试

```bash
# 后端：编译
cd server && mvn -q clean test-compile

# 后端：关键接口
curl -s http://127.0.0.1:8081/brand/list
curl -s 'http://127.0.0.1:8081/car/list?typeId=1&current=1&x=121.4737&y=31.2304'
curl -s http://127.0.0.1:8081/car/5
curl -s http://127.0.0.1:8081/review/hot
curl -si http://127.0.0.1:8081/user/me | head -1      # 期望裸 401

# 前端
cd web && pnpm typecheck && pnpm test && pnpm build
```

> ⚠️ **后端 `mvn test` 目前会失败**：教程遗留的 `LoginTest.testGenerateUser` 会重复创建
> 手机号 `17600000000`，撞 `tb_user.uniqe_key_phone` 唯一索引。这是测试数据问题，不是业务代码问题。
> 日常验证用 `mvn -q clean test-compile`。RedisTest / RedissonTest 通过。

前端测试覆盖的是**契约与行为**，不是像素：接口形状、mock 与真机语义一致、白名单单星号、
`data-reveal` 配对、路由顺序等。跨目录的 `.spec.ts` 会直接读后端源码校验注解与字面量，
这是设计意图 —— 改后端契约时它们会红。

---

## 11. 已知限制与坑（按重要性排序）

| # | 问题 | 影响 | 处理 |
|---|---|---|---|
| 1 | `/car/{id}` 冷缓存直接返回「车源不存在」 | 清 Redis 后详情页全挂 | 跑 `init-car-cache.sh` |
| 2 | 车源集中在 3 城，GEO 半径硬编码 5 km | 其他城市附近查询为空 | 前端有空态；改坐标要同步改 mock |
| 3 | 品牌 9/10 无车源 | 点进去空态 | 删行是数据变更，需确认 |
| 4 | 秒杀异步落库 | 返回订单 id 时数据库可能还没这行 | 前端不要立刻查订单；也没有订单查询接口 |
| 5 | `tb_blog_comments` 功能未实现 | 评论不可用 | Controller 空壳，别照着写前端 |
| 6 | 后端 `mvn test` 失败 | CI 式全量测试不可用 | 教程测试数据重复手机号；用 `test-compile` |
| 7 | 列表无价格 / 里程排序 | 只能客户端排当前页 | 客户端排序会误导成全站排序 |
| 8 | 上传目录 `uploads/imgs` 不在版本库 | 新环境目录为空 | 运行时自动 `mkdirs`，属预期 |

### 改代码时最容易静默出错的五处

1. **改 Controller 路径忘了改 `MvcConfig` 白名单** → 公开接口全部 401，无编译错误。
2. **在组件里直接读后端字段**（不做 `adapt.ts` 映射）→ 真机整块 section 消失。
3. **`data-reveal` 漏配 `useReveal`** → 元素永久隐形，DOM 里却有内容。
4. **改了 `usedcar.sql` 的坐标没改 `mockCarCoords`** → mock 与真机「附近」结果对不上。
5. **改了 Redis key 常量**（尤其 `login:*`）→ 已登录用户静默掉线。

---

## 12. 推荐阅读顺序

按这个顺序读，每一站都建立在前一站之上：

1. **本文 §1–§3** —— 先有全局图和目录感
2. [`README.md`](README.md) —— 跑起来（mock 模式不需要后端）
3. **前端一条纵线**：
   `web/src/views/HomeView.vue` → `web/src/api/car.ts` → `web/src/api/adapt.ts`
   → `web/src/api/mock.ts` → `web/src/api/types.ts`
4. **前端一条横线**：
   `web/src/api/client.ts`（托底逻辑）→ `web/src/stores/auth.ts` → `web/src/router/index.ts`
5. **后端一条纵线**：
   `CarController` → `ICarService` → `CarServiceImpl` → `CacheClient` → `CarMapper`
6. **后端支撑面**：
   `MvcConfig` → 两个 Interceptor → `Result` / `UserHolder` → `RedisConstants`
7. **业务机制**（按兴趣挑）：
   秒杀 `VoucherOrderServiceImpl` + `seckill.lua`；
   Feed `ReviewServiceImpl#queryReviewOfFollow`；
   关注 `FollowServiceImpl`；签到 `UserServiceImpl#signCount`
8. **改代码前**：`web/CLAUDE.md` + `server/CLAUDE.md` 的「已知坑 / 硬约束」
9. **要接口细节**：`server/docs/API.md`

---

**一句话总结**：这是一个「用一套 Redis 实战能力，做成一个完整二手车产品」的项目；
理解它的关键在于记住**三层词汇的落差**（前端模型 / 后端接口 / 教程表名）和
**两条数据源必须同形状**（mock 与真机）。
