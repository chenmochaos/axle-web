# M2 实施计划：车辆详情页 `/car/:id`

> **状态：已实施并验收（2026-10-16）。**
> 本文件是**动手前的计划原文**，保留当时的判断依据与取舍理由，不做回溯性修改。
> 实施中有 **三处有意偏离**，以 `docs/specs/2026-10-15-二手车平台-design.md` 为准：
>
> 1. **hero 改成 4:3 两栏构图**（原计划是全宽大图）。全宽 hero 在 1440 宽时是 3:1，
>    把 4:3 的卡片矩形非等比放大过去，`scaleX`（≈0.28）与 `scaleY`（≈0.67）差 **2.4 倍** ——
>    飞行途中图会被横向压扁，那不是「快得看不清」，是一眼可见的故障。计划里
>    「靠 0.8s 高速运动盖过去」这条理由对 1.2 倍以内的差异成立，对 2.4 倍不成立。
>    改成与卡片同比例后两个 scale 完全相等，连裁切内容都一致，转场是**真的无缝**。
>    代价是首屏不再满幅，换来价格 / 车名 / 车况在第一屏可读。
> 2. **原计划的「2 关键标签条」与「4 车况」两个板块取消**，折进 hero ——
>    车况的四个字段（评分 / 过户 / 里程 / 上牌）本来就是 hero 与参数表的内容，
>    单开一节只是把同样的数字换个地方再写一遍。
> 3. **参数表只留「这台车是什么」**：车况评分、已咨询 归 hero，所在地、距我 归门店区块。
>    第一版这四项在表里，于是与 hero / 门店块逐字重复了一遍 —— 一页上同一个值出现两次很廉价。
>
> 实施时另外查实与踩到的（计划中已记录前两项）：
>
> - `usedcar` 分支并不存在，真机路径今天必然算出残缺的 `Car`（计划里已写明）
> - `mx5(1).jpeg` 与 `mazda-mx5.jpeg` 确为同车同场拍摄的另一个角度（计划里已写明）
> - **新发现**：`data-reveal` 只有 CSS 的「先藏住」，缺了 `useReveal` 的元素会**永久隐形**，
>   且不报错、`reduced-motion` 下还被 CSS 兜底掩盖。详情页第一版就这么漏了整页。
>   现在由 `src/composables/useReveal.spec.ts` 静态守住这条配对
> - 页脚「每台车经过 176 项检测，随车附第三方检测报告」与页脚的 `/seckill/1` 死链一并删掉：
>   前者是没有数据支撑的功能声称，后者那个 id 不是任何真实券

---

# M2：车辆详情页 `/car/:id`

## Context

M1 首页已交付并推送（`4bd5a65`）。M2 的定义是「车辆详情 + 抢购页」，**本轮只做详情页** ——
抢购页依赖登录态（M3 才有），现在做只能是空壳。抢购页下一轮连着登录一起做。

三个已确认的决策：

1. **只做有真实数据支撑的板块**。验车报告、漆膜仪、保养记录、多角度图库一律不做 —— 没有数据源，
   编出来的检测项等于在演示里造假。
2. **共享元素转场用手写 FLIP**，不用 GSAP Flip 插件。
3. 首屏 MX-5 保持不动（那张粉色宽体图抠图会把车切成两半，且源图只有 741px 宽，更糊）。

### 探索查实的两件事（都影响本轮）

**① 文档里有一个不成立的事实。** `hmdp-web/README.md:49` 与 `CLAUDE.md:3` 都写着「后端是
`hmdp-master` 的 `usedcar` 分支，它给商铺表加了车辆扩展字段」。实测：

- 两个后端仓库（`hmdp-master/`、`本地生活点评平台/`）`git branch -a` 都没有 `usedcar`
- 全仓库 grep `mileage|register_date|gearbox|fuel|displacement|owner_count` 及中文字样 → **0 命中**
- `tb_shop` DDL 就是原始 15 列，`Shop` 实体 16 字段（15 持久化 + 1 瞬态 `distance`），无车辆语义字段

也就是说 `VITE_USE_MOCK=false` 这条路径**今天必然算出残缺的 Car**（里程/变速箱/能源全是 undefined）。
本轮不建后端分支，但要把文档改对（见「文档同步」）。

**② 素材里挖出一条真实图集。** `public/cars/mx5(1).jpeg` 与 MX-5 当前源图 `mazda-mx5.jpeg`
是**同一台车、同一场拍摄的另一个角度**（同轮毂、同尾翼、同侧标、同背景的白楼与草坪）。
所以 car 10 可以有一条**两图的真实图集** —— 这让「多图」这个板块有真实数据可依，不必编。
（顺带：Minus 刚发的那张粉色 MX-5 与 `public/cars/mx5.jpeg` **md5 完全相同**，是同一个文件。）

---

## 页面结构（板块只用真字段；某字段缺失就整行/整块不渲染）

| # | 板块 | 数据来源 | 缺数据时 |
|---|---|---|---|
| 1 | Hero 大图 + 车名 + 价格 | `images[0]`（有第二张时给缩略图条）、`name`、`price` | 车不存在 → 空态页 |
| 2 | 关键标签条 | 一手车（`ownerCount`）、能源（`fuel`）、大类（`kind`）、里程 | 逐项过滤 |
| 3 | 参数表 | 里程 / 上牌 / 变速箱 / 能源 / 排量 / 过户 / 车况分 / 已咨询 / 所在地 / 商圈 | 逐行 `v-if` |
| 4 | 车况 | `score` + `ownerCount` + `mileage` + `registerDate` | 全缺则不渲染 |
| 5 | 限时特价与购车券 | `GET /voucher/list/{shopId}`（`shopId` = 车 id） | 空数组 → 整块不渲染 |
| 6 | 车商 / 门店 | `address`、`area`、`distance` | 逐行 |
| 7 | 相似车源 | `fetchSimilarCars`（同品牌优先，补同大类，排除自己，取 3） | 不足 3 台就渲染现有的 |
| 8 | 底部操作条 | 仅当该车有 `type=1` 秒杀券时出现，跳 `/seckill/{voucherId}` | 无券 → 不出现 |

**关于底部操作条**：不做「预约看车」—— 后端没有预约接口，那会是个假按钮。
有秒杀券时是「限时特价 · 立即抢购」（跳详情页下一轮的实现，本轮落在 PlaceholderView，属已知过渡态），
没有就不出现。

**关于滚动叙事**：spec §6.1 原本写「外观 → 内饰 → 参数 → 车况」，内饰没有素材。
改成 Hero 大图做**滚动视差**（图片在 `overflow-hidden` 容器内 `y` 位移 + 轻微 scale），
下面的价格/参数面板用负 `margin-top` + 圆角上沿**叠到大图上**，读出「面板从图上滑过」的观感。
**不 pin** —— pin 需要 ScrollTrigger 与 Lenis、`out-in` 转场三方对齐，是这个项目最容易出 bug 的组合，
而收益（图片在钉住期间渐变）在我们只有一张图的前提下根本兑现不了。

---

## 共享元素转场：手写 FLIP

问题：路由转场是 `<Transition mode="out-in">`，**卡片在详情页挂载之前就被卸载了**，
`Flip.getState()` 拿到的元素已不在文档里，能不能用取决于 GSAP 的未文档化行为 —— 不值得赌。

做法（数学就是 Flip 内部算的那套，抽成纯函数所以能单测）：

`src/lib/flip.ts`

```ts
export interface FlipSource { id: string; rect: DOMRect }
let pending: FlipSource | null = null
export function recordFlipSource(el: HTMLElement)   // 卡片点击时调用
export function consumeFlipSource(id: string)       // 详情页挂载时取，id 不匹配则丢弃
/** 把元素从 from 矩形变换到它当前所在的 to 矩形所需的 transform。
 *  以 to 的左上角为原点，因此返回 translate 分量已扣除缩放的影响。 */
export function flipTransform(from: Rect, to: Rect): { x: number; y: number; scaleX: number; scaleY: number }
```

- `CarCard.vue` 的 `RouterLink` 加 `@click`：读图片的 `getBoundingClientRect()` 与 `data-flip-id` 存进模块变量
- `CarHero.vue` 挂载后 `consumeFlipSource(\`car-image-${id}\`)`：命中就以 `flipTransform` 的结果作为初值，
  用 `gsap.fromTo` 补间到 `{ x:0, y:0, scaleX:1, scaleY:1 }`（0.8s `--ease-cinematic`），同时价格/车名那一层淡入
- **跳过条件**（任一命中就直接显示终态）：`prefers-reduced-motion`、无记录、id 不匹配（刷新/直连/前进后退）、
  记录的 rect 面积 < 1px²（元素当时不可见）
- 卡片的 `data-flip-id` 从「预埋的意图」变成**承重件**：id 匹配是「这段矩形属于正在显示的车」的校验

**已知局限（写进注释，不假装无缝）**：卡片图是 `aspect-[4/3] object-cover`，详情页 hero 是宽幅
`object-cover`，两者裁切比例不同。变换过程中图片按整体缩放，看到的内容与卡片上的裁切**不完全一致**，
靠 0.8s 的高速运动盖过去。要做到像素级无缝得让 hero 也用 4:3 —— 那是构图上的倒退，不做。

---

## 文件清单

**新增**

| 文件 | 职责 |
|---|---|
| `src/views/CarDetailView.vue` | 页面骨架：取参 → 加载 → 骨架屏 / 空态 / 内容；`useReveal` 交错入场 |
| `src/components/business/CarHero.vue` | 大图 + 视差 + 缩略图条 + FLIP 目标 + 车名与价格层 |
| `src/components/business/SpecTable.vue` | 参数表，接 `Spec[]`（`{label, value}[]`），空数组不渲染 |
| `src/components/business/VoucherCards.vue` | 券列表，按 `type` 分支（普通券没有 stock/begin/end，见下） |
| `src/components/business/StickyBuyBar.vue` | 底部操作条；`position: sticky` 而非 fixed，避免与 fixed header 打架 |
| `src/lib/flip.ts` + `src/lib/flip.spec.ts` | 上面那套 |
| `src/lib/carName.ts` + `src/lib/carName.spec.ts` | 从 `HeroSection.vue` 抽出 `displayName`（去掉 `(ND)` 这类后缀）—— 详情页要用同一份口径，不能各写一遍 |

**修改**

| 文件 | 改动 |
|---|---|
| `src/api/types.ts` | 加 `Voucher`（id/shopId/title/subTitle/rules/payValue/actualValue/type/status/stock/beginTime/endTime，后四个可空） |
| `src/api/car.ts` | 加 `fetchVouchersOfShop(shopId)`（mock 走 `mockVouchers`，真机走 `/voucher/list/{shopId}`）、`fetchSimilarCars(car, limit = 3)` |
| `src/api/mock.ts` | 加 `mockVouchers`（挂 2–3 台车，含一张 `type=1` 秒杀券）；car 10 的 `images` 补第二张 `mx5(1).jpeg` |
| `src/api/car.spec.ts` | 新增：相似车源不含自己且同品牌优先、`fetchCarDetail` 越界返回 undefined、每张 `images[i]` 都真实存在、秒杀券的 stock/时间字段齐全 |
| `src/components/business/CarCard.vue` | `@click` 记录 FLIP 源 |
| `src/components/business/HeroSection.vue` | 改用抽出的 `carName` |
| `src/components/business/FeaturedCars.vue` | 头部文案参数化（`eyebrow`/`title`/`moreTo`/`moreLabel`，默认值 = 现在的文案），详情页复用同一组件渲染相似车源 |
| `src/router/index.ts` | `/car/:id` → `CarDetailView` |
| `src/views/PlaceholderView.vue` | 不动（`/seckill/:id` 还要用） |

**复用（不要重写）**：`useReveal`（`data-reveal` 契约）、`useCountUp` / `StatCount`（价格与评分滚动）、
`AppTag`、`AppButton`、`SkeletonBlock`、`refreshScrollTriggers`、`CarCard`。

**注意**：`SiteLayout` 的 header 是 `fixed`，`h-[4.5rem]`（72px），而 `<main>` **没有任何顶部留白**
（首页靠 HeroSection 自己的 `pt-` 顶开）。详情页必须自己加，否则大图顶部被 header 压住。

---

## 测试（沿用现有形态：纯函数 + 数据，不引入 `@vue/test-utils`）

项目现在三个 spec 全是纯函数/数据测试，没有组件挂载的先例。为了一个页面引入 `@vue/test-utils`
不划算 —— 把可测的抽成纯函数：`flipTransform`（含边界：零尺寸、负宽、等比与不等比缩放）、
`carName`、`fetchSimilarCars` 的排序与排除逻辑、mock 素材存在性。
动效本身靠 headless Chrome 实测，不靠单测。

---

## 验证

```bash
cd hmdp-web && pnpm typecheck && pnpm test && pnpm build
```

一次性 puppeteer 脚本（写 `/tmp`，不进仓库）逐条打勾：

1. **直连不崩**：`/car/5` 直接打开，无 console error，无 FLIP 也正常显示终态
2. **FLIP 真的发生**：首页点第 1 张卡片，详情页 hero 图挂载后头几帧的 `getBoundingClientRect()`
   应≈卡片图的 rect，0.8s 后收敛到终态 rect
3. **刷新跳过 FLIP**：`/car/5` 上 `reload()`，hero 图首帧就是终态（无动画）
4. **header 不遮内容**：hero 车名块的 `rect.top` > 72
5. **操作条**：有秒杀券的车出现、无券的车不出现
6. **相似车源不出自己**：卡片 id 集合不含当前 id
7. **减弱动效**：`prefers-reduced-motion` 下 FLIP 跳过、`[data-reveal]` 内容可见（不能被 opacity:0 卡住）
8. **无假板块**：页面上不出现「验车报告」「保养记录」等字样
9. 截图人工看一遍（hero、参数、券、相似车源、空态）

---

## 文档同步（项目规矩：先改文档再改实践）

- `docs/specs/2026-10-15-二手车平台-design.md`
  - §2 第 4 行：详情页「多图 + 参数 + 车况 + 券」→ 按实际能力改写（图集仅在素材支持时出现）
  - §6.1：滚动叙事「外观 → 内饰 → 参数 → 车况」→ 改写为实际板块顺序，并写明**为什么不做 pin**
  - §6.1 / §6.4：共享元素转场改成「手写 FLIP」+ 为什么不用 GSAP Flip 插件 + 裁切比例不同的已知局限
  - §3.6：「`--max-width` 提到 2800」的触发条件限定为「详情页要用抠图时」—— hero 走原图，本轮用不上
  - 新增一节记录**后端车辆字段的实际情况**（`usedcar` 分支不存在，真机路径的缺口）
- `hmdp-web/README.md:49`、`hmdp-web/CLAUDE.md:3`：把「后端有 `usedcar` 分支」改成事实描述
  （「计划中的 `usedcar` 分支尚未创建；当前真机路径只能映射 `tb_shop` 现有 15 列」）
- `hmdp-web/CLAUDE.md` 目录树：补 `views/CarDetailView.vue`、`lib/flip.ts`、`lib/carName.ts` 等

---

## 明确不做

- **抢购页 `/seckill/:id`** —— 下一轮连登录一起做
- **预约看车 / 收藏 / 咨询** —— 没有后端接口，不做假按钮
- **地图选点** —— 没引入地图库，只展示 `address`/`area` 文本
- **口碑板块** —— `fetchHotReviews()` 是全局热门，不按车筛；按车关联要动 mock 数据模型，留给 M4
- **重跑抠图流水线** —— 详情页 hero 用原图（3000–7680px），不碰抠图
- **建后端 `usedcar` 分支** —— 那是后端的工作，本轮只把前端文档改对
