# AXLE · 精选二手车平台

一个可深链、可刷新、能真机下单的二手车交易平台。**Vue 3 + TypeScript** 前端，
**Spring Boot + MySQL + Redis** 后端，放在同一个仓库里。

![首屏](docs/screenshots/hero.jpg)

![车源列表](docs/screenshots/listings.jpg)

## 这个项目要解决什么

数据模型与后端能力来自[黑马程序员 Redis 教程](https://www.bilibili.com/video/BV1cr4y1671t)
的 hmdp（黑马点评）项目 —— 手机号验证码登录、token 滑动续期、缓存与逻辑过期、优惠券秒杀
一人一单、Redis 分布式锁、点赞、关注 Feed 流、GEO 附近查询。教程自带的前端是 jQuery 页面，
只够证明接口通了。

本项目把同一批能力接成一个**真看得过去的二手车平台**，并把后端的领域词汇一并改造成车：
商铺对应车源、商铺分类对应品牌、探店笔记对应口碑。业务上也自洽 —— 一辆车只能卖给一个人，
「秒杀 + 一人一单」在这里比在点评站更说得通。

```
web/      Vue 3.5 + Vite + TS + Pinia + Tailwind v4 + GSAP / Lenis
server/   Spring Boot 2.7.4 + MyBatis-Plus + MySQL 8 + Redis 8 + Redisson
docs/     设计 spec、实施计划、截图
```

## 快速开始

### 0. 依赖

Node 20+ / pnpm · JDK 21 或 25 · Maven · MySQL 8 · Redis 8

### 1. 数据库（首次）

```bash
mysql -udev -e "CREATE DATABASE IF NOT EXISTS hmdp DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_general_ci;"
mysql -udev hmdp < server/schema.sql
```

### 2. 密码

`server/.env`（**已在 `.gitignore` 中，不要提交**）：

```
MYSQL_PASSWORD=<本机 MySQL 密码>
```

### 3. 二手车数据 + Redis 预热

```bash
cd server
mysql -udev -p"$MYSQL_PASSWORD" hmdp < usedcar.sql   # 幂等；必须用 mysql 客户端（用了 DELIMITER）

./scripts/init-car-geo.sh          # 「附近优先」的坐标索引
./scripts/init-seckill-stock.sh    # 秒杀库存
./scripts/init-car-cache.sh        # 车辆详情缓存 ← 顺序重要，见 server/CLAUDE.md
```

### 4. 后端

```bash
cd server && mvn spring-boot:run     # http://localhost:8081
```

### 5. 前端

```bash
cd web && pnpm install
pnpm dev                             # http://localhost:5173，默认走内置 mock
```

**默认不需要后端** —— `VITE_USE_MOCK` 未设或非 `'false'` 都走 mock，首屏与列表页完整可用。

连真后端：

```bash
VITE_USE_MOCK=false pnpm dev --port 5174
```

> ⚠️ 真机模式下 `GET /car/{id}` 走「逻辑过期」缓存，**冷缓存会直接返回「车源不存在」且不回查数据库**。
> 清过缓存后必须重跑 `server/scripts/init-car-cache.sh`，否则列表正常、详情页全挂。

### 一条命令跑全套（可选）

```bash
cd web && pnpm build:embed     # 产物写进 ../server/src/main/resources/static（gitignore）
cd ../server && mvn package    # 打出的 jar 直接托管整个站点
```

## 关于数据

14 台车源只落在 **3 个城市** —— 上海 5 台、北京 5 台、深圳 4 台，同城车辆相距 2 km 上下。
这是刻意的：`/car/list` 的 GEO 半径硬编码 5 km，坐标散开时「附近优先」在任何城市都只能查出
1 台，看着像坏了。代价是这 3 城之外的定位查出来是空的（列表页有空态文案，不静默降级）。

真机坐标在 `server/usedcar.sql` 的 `tb_shop.x/y`，mock 坐标在 `web/src/api/mock.ts` 的
`mockCarCoords`，**两处必须同步改**。

## 进度

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 | 首页：首屏轮播、品牌导航、精选车源、热门口碑 | ✅ |
| M2 | 车辆详情 `/car/:id`：大图、参数表、限时特价、相似车源 | ✅ |
| M3 | 登录、抢购 `/seckill/:id`、车源列表 `/cars/:brand?`（GEO） | ✅ |
| M4 | 口碑广场 `/review`、口碑详情、发布口碑、关注动态 `/feed`、车商主页 | ✅ |
| M5 | 个人中心 `/me`、编辑资料 `/me/edit`、连续签到 | ✅ |

> 想快速熟悉整个项目，读 [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md)：
> 架构、目录、11 张表、Redis key、数据流、本地启动与已知坑都在那里。

## 已知缺口

- `tb_blog` **内容没有改造**：接口与页面（口碑广场 / 详情 / 发布 / Feed）都已交付，
  但库里 4 条种子口碑仍是教程原始的餐厅探店文字，4 张图指向不存在的 `/imgs/blogs/...`。
  这是**独立的数据迁移**，需要单独确认后执行。
- `tb_shop_type` 里保时捷 / 沃尔沃两个品牌没有车源，点进去是空态。
- 抢购成功后只给订单号、不给「我的订单」入口 —— 后端没有任何订单查询接口，
  且那一单此刻还在 Redis Stream 里排队、数据库里还没有这行。
- 列表页没有价格 / 里程排序 —— 后端没有排序参数，拿已加载的 10 条在客户端排，
  用户会读成「全站最便宜」，在真机分页下那是错的。

## 素材与许可

车辆照片是**演示用占位素材**，来自公开图库与网络，**未取得明确商用授权**，部分含厂商标识与车牌。
它们仅用于演示界面效果；要在任何正式场景使用，请先替换 `web/public/cars/` 下的图片。
字体 Inter 与 Oswald 通过 Google Fonts 加载（SIL OFL 1.1）。仓库暂未附 LICENSE 文件。

更多细节：前端约束见 [`web/CLAUDE.md`](web/CLAUDE.md)，后端规则见 [`server/CLAUDE.md`](server/CLAUDE.md)，
产品级设计见 [`docs/specs/`](docs/specs/)。
