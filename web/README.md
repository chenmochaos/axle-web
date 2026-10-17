# web/ — AXLE 前端（Vue 3 + TypeScript）

二手车平台的前端。项目总览、后端与数据说明见[仓库根 README](../README.md)；
前端的设计硬约束（零彩色 UI、字体分工、动效纪律）见 [`CLAUDE.md`](CLAUDE.md)。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Vue 3.5 `<script setup>` |
| 构建 | Vite |
| 语言 | TypeScript（`vue-tsc` 严格校验） |
| 样式 | Tailwind CSS v4（`@theme`，token 在 `src/styles/tokens.css`） |
| 状态 | Pinia |
| 路由 | Vue Router |
| 动效 | GSAP 3（含 ScrollTrigger）+ Lenis，共享同一个 rAF 时钟 |
| 请求 | axios，拦截器统一注入 token、统一处理 401 |
| 测试 | Vitest |

## 快速开始

```bash
pnpm install
pnpm dev                  # http://localhost:5173，默认走内置 mock，不需要后端
```

连真后端（后端在 `../server`，端口 8081，启动方式见根 README）：

```bash
VITE_USE_MOCK=false pnpm dev --port 5174
```

## 命令

```bash
pnpm dev           # 开发服务器
pnpm typecheck     # vue-tsc 类型检查
pnpm test          # Vitest
pnpm build         # 类型检查 + 生产构建（输出 web/dist）
pnpm build:embed   # 构建产物写进 ../server/src/main/resources/static/（被 gitignore）
```

### `build:embed` 的边界

`build:embed` 会把 `VITE_API_BASE` 设为空串，接口改为同源直连后端根路径，
配合 `mvn package` 可以把整站打进一个 jar。

**已知限制**：前端页面路由 `/car/:id`、`/review/:id` 与后端接口同路径。
单 jar 模式下**首次加载与站内跳转都正常，但在这两个页面刷新会命中接口**（返回 JSON 或 401），
而不是页面。日常开发请用 `pnpm dev`；要彻底解决，需要给后端接口统一加 `/api` 前缀。

## 两条数据源

`src/api/client.ts` 的 `USE_MOCK` 是**全站唯一**读 `VITE_USE_MOCK` 的地方；
未设置或非 `'false'` 都走 mock。mock 14 台车与真机 `tb_shop` 的 id 一一对应
（真机共 14 行），所以 `/car/5`、`/seckill/5` 在两种模式下指向同一台车。

后端契约的差异（分→元、×10 评分、逗号串→数组、平铺作者→嵌套、HTML 换行）**只允许**
在 `src/api/adapt.ts` 里抹平。组件里就地打补丁等于把适配层架空。

## 目录

```
src/
├── api/          接口层（client / adapt / car / user / order / mock / types）
│                 client.ts 是 axios 实例，也是 USE_MOCK 的唯一读者；adapt.ts 是唯一的字段映射处
├── components/
│   ├── business/ 业务组件（IntroCurtain / HeroSection / BrandNav / FilterBar / CarCard /
│   │             FeaturedCars / ReviewFeed / CarHero / VoucherCards / StickyBuyBar）
│   └── ui/       无业务语义的基础组件（AppButton / AppField / AppTag / StatCount / SkeletonBlock）
├── composables/  useReveal / useCountUp / useCountdown / useScrollTo
├── layouts/      SiteLayout（由 App.vue 包住 RouterView）
├── lib/          gsap / lenis / intro 单例；fit.ts（车台面积归一）；time.ts；flip.ts
├── router/
├── stores/       auth.ts（唯一的 Pinia store）
├── styles/       tokens.css + main.css（含路由转场）
└── views/        HomeView / CarDetailView / LoginView / SeckillView / CarListView / PlaceholderView
```

设计与实施文档在仓库根的 [`docs/`](../docs/)（前端不再自带一份）。

## 车辆抠图（可选）

首屏的车是透明背景 WebP，由 `scripts/cutout-cars.py` 从 `public/cars/*.jpg` 生成：

```bash
python3 -m venv .cutout-venv
.cutout-venv/bin/pip install onnxruntime numpy pillow scipy
.cutout-venv/bin/python scripts/cutout-cars.py            # 默认 u2netp
.cutout-venv/bin/python scripts/cutout-cars.py --model isnet-general-use   # 边缘更锐，需下 176MB
```

模型首次运行自动下载。仓库里已经带了生成好的产物，不改素材不需要跑这条流水线。
模型输入固定 320×320，脚本**按长边等比缩放再补边**，不是直接拉成正方形 ——
拉成正方形会让车变形、轮子被吃掉一块。

## 素材与许可

车辆照片是**演示用占位素材**，来自公开图库与网络，**未取得明确商用授权**，部分含厂商标识与车牌。
要在任何正式场景使用，请先替换 `public/cars/` 下的图片。字体 Inter 与 Oswald 通过
Google Fonts 加载（SIL OFL 1.1）。仓库暂未附 LICENSE 文件。
