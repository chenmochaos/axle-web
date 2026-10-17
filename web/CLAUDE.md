# web/ — 二手车平台前端（作品集级动效）

本仓库 `web/` 目录的规则。项目总览见根 `README.md`，后端在 `../server`。
把「本地生活点评」的功能语义映射到「二手车交易」：一辆车只能卖给一个人，秒杀 + 一人一单在这里完全自洽。

> **后端已完成二手车改造。** `tb_shop` 现在是 **23 列**
> = 原 15 + 8 个车辆列（`mileage` / `register_date` / `gearbox` / `fuel` /
> `displacement` / `owner_count` / `kind` / `original_price`），`tb_shop_type` 加了 `mark`，
> 14 行车源全部改写成车源。迁移脚本是 **`../server/usedcar.sql`**（幂等、不删任何行），
> 运行方式见脚本头部注释与根 README「连真实后端」。
>
> **所以 `VITE_USE_MOCK=false` 这条路径是通的**，车字段不再是 `undefined`。
> 口碑种子内容也已改写成二手车口碑，配图指向 `public/cars/` 下真实存在的文件
> （迁移见 `../server/usedcar.sql` §4）。
>
> 后端类名、接口路径与 Redis key 已统一为 `car` / `brand` / `review`，详见 `../server/CLAUDE.md`。

## 分支

`main` 为工作分支。设计文档在仓库根 `../docs/specs/`，实现计划在 `../docs/plans/`。

## 技术栈

Vue 3.5（`<script setup>`）/ Vite / TypeScript / Pinia / Vue Router
Tailwind CSS v4（`@tailwindcss/vite` 插件）/ GSAP 3.15 全插件 / Lenis / axios

> **为什么只有 GSAP 一套动效引擎**：`motion`（原 Framer Motion）自 14.x 起已移除 Vue 支持，
> Vue 版是独立包 `motion-v`。不用它的原因不是它不好，而是没必要——GSAP 3.13 起被 Webflow
> 收购后全部插件开源免费，`Flip`（共享元素转场）、`SplitText`（逐字动画）、`ScrollTrigger`
> （滚动叙事）完整覆盖需求，且与 Lenis 共用同一个 ticker。两套引擎并存只会互相抢 rAF 帧。

## 命令

```bash
pnpm dev          # 开发服务器 5173，/api 反代到后端 8081（默认走 mock 数据）
pnpm typecheck    # vue-tsc --noEmit
pnpm build        # 类型检查 + 构建
pnpm test         # vitest（**不做类型检查**，只有 typecheck/build 会）

# 连真后端的模式：同一份代码，两条数据源路径。
VITE_USE_MOCK=false pnpm dev --port 5174

# 验收截图：驱动系统 Chrome 拍首页各段落，人工看效果。
# 这是「改完必须亲眼看」的抓手 —— 构建通过不等于页面是对的。
node scripts/screenshot.mjs                 # 默认 http://localhost:5173/ → /tmp/axle-shots
node scripts/screenshot.mjs <url> <outDir>  # 换目标
```

后端必须先起：`cd ../server && mvn spring-boot:run`（端口 8081）。

### 数据源由 `VITE_USE_MOCK` 决定，默认 mock

`USE_MOCK` 这个常量**只在 `src/api/client.ts` 里读一次** `import.meta.env.VITE_USE_MOCK`，
其余模块一律 import 它 —— 别在各处重新读一遍 env，那样会出现「同一页面一半走 mock 一半走真机」，
而这种不一致没有任何症状。

**未设或非 `'false'` 都算 mock。** 所以默认（`pnpm dev`）是不需要后端的，
这是 README 里「不需要后端就能看完整」那句承诺的实现方式。

**改完一个接口要在两种模式下都验一遍。** 两条路径的分叉不只在数据内容，
更在**形状**（真机是逗号串、平铺作者、没有 total）——
M3 期间真机首页口碑区整块消失，就是只在 mock 下验过的后果。

### 真机模式下怎么拿验证码

后端没有短信网关，验证码只 `log.debug` 打出来并存进 Redis 2 分钟：

```bash
redis-cli get login:code:<手机号>
```

登录页在 `import.meta.env.DEV` 下会提示这一点（**生产构建里没有这条提示**）。

## 边界

前端只通过 HTTP 与后端交互，不 import 后端任何代码。唯一跨目录的耦合是
`src/api/*.spec.ts` 读 `../server/src/main/java/com/axle/` 的源码来锁契约 ——
那是**测试**对注解与字面量的静态校验，改后端注解时这些用例会红，这是设计意图。

## 硬约束

### 1. 零彩色 UI

界面**不允许出现任何带色相的 UI 颜色**。没有绿的成功提示，没有红的错误提示，
没有蓝色的链接，没有品牌主色。

- 色板只有中性灰阶（`--color-ink-*`，色相恒定、饱和度为 0）
- 强调靠**明度反转**：主按钮 = 纯黑底白字，次级按钮 = 透明底 + 细描边
- 状态反馈也是纯明度语言：成功 = 黑色光圈扩散，失败 = 界面骤暗 + 微震
- **唯一的色彩来源是车辆照片本身** —— 界面零饱和度，车漆才会跳出来

写代码时：不要写 `text-green-500`、`bg-red-500`、`#3b82f6` 这类值。
需要区分层次就用 `ink-100` / `ink-800` 的明度差。

### 1.1 全站亮色（2026-10-15 修订）

**全站统一 `#FFFFFF` 底，没有暗色区域。** 原方案的「营销页暗色 / 功能区亮色」已推翻：
车辆图是抠图资产、本身没有场景，放纯黑上要靠界面补三层空间感（顶光/地平线/暗角）才不飘，
那是界面在替照片演戏；放白底上车直接成立，界面退到只剩排版。

`tokens.css` 里不要再加回 `.theme-dark`。组件一律用语义 token
（`bg-bg` / `text-fg` / `border-line` / `text-fg-muted`），别硬编码 `ink-950`、`text-white` ——
换肤时硬编码的那几处就是重灾区。**唯一例外**：压在车辆照片上的覆盖层（`CarCard` 的渐变与胶囊），
那里的黑白是相对照片而非相对主题，永远不变。

### 1.2 字体规则

- `--font-sans`（Inter + Noto Sans CJK）：中文、正文、数字
- `--font-display`（Oswald）：**只用于全大写的拉丁展示文字** ——
  AXLE 字标、首屏主标题、首屏车名、品牌 mark、段落 eyebrow

Oswald 没有 CJK 字形，中文落进去会掉回 Noto 造成一行两种字体，所以混排的中文标题一律不用它。

### 2. Lenis 是单例

`src/lib/lenis.ts` 导出的实例全应用唯一。**组件里永远不要 `new Lenis()`** ——
第二个实例会和 GSAP ticker 抢 `requestAnimationFrame`，表现为滚动抖动 + 动画掉帧。
需要滚动能力时 `import { lenis } from '@/lib/lenis'`，或直接用 `useScrollTo()`。

Lenis ↔ GSAP 同步是硬性要求，三行缺一不可（已在 `lenis.ts` 里封装）：

```ts
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((time) => lenis.raf(time * 1000))
gsap.ticker.lagSmoothing(0)   // 漏了这行会抖
```

### 3. 后端契约

- token 塞在请求头 **`authorization`（全小写）**，拦截器读的就是这个小写 key，
  写 `Authorization` 会 401。已由 `src/api/client.ts` 的拦截器统一处理。
- 免登录路径：`/user/code` `/user/login` `/user/logout` `/user/profile/*` `/review/hot`
  `/review/*` `/review/likes/*` `/review/of/user` `/car/**` `/brand/**` `/upload/**` `/imgs/**` `/voucher/**`
- 秒杀返回订单 id ≠ 已落库（Redis Stream 异步），**不要拿返回值立刻查订单**
- Feed 流分页是 `lastId + offset`，不是 `current` 页码
- GEO 附近车商需要 `navigator.geolocation` 坐标，不给坐标退化成普通分页

#### 3.1 M3 实测订正的六条（前三条是与旧文档不符，后两条是新踩的坑）

1. **未登录返回的是裸 401 + 空 body**，不是 `{"errorMsg":"请登录"}`。
   `LoginInterceptor` 直接 `response.setStatus(401)`。所以 `client.ts` 里判
   `errorMsg === '请登录'` 那条分支是**防御性的，不是主路径** —— 主路径是状态码。
   全仓库 grep `请登录` 在 Java 侧只有一处，在 `config/MvcConfig.java` 的一段注释里，
   **没有任何 Java 代码会返回它**。
2. **`POST /user/login` 返回裸 token 字符串**（不是 JSON 对象）。拿到 token 后必须再调
   `GET /user/me` 才得到 `{id, nickName, icon}`。
3. ~~`POST /user/logout` 是后端占位接口~~ —— **2026-10-17 已实现**。
   `auth.logout()` 现在先调后端删 Redis token，再清本地；接口失败也照样清本地
   （否则用户会卡在「登不出去」）。调用方必须 `await`。
4. **列表接口不返回 `total`**（`/car/list`、`/review/hot` 都走 `Result.ok(list)` 单参重载，
   `total` 恒为 `null`）。「还有没有下一页」只能按**满页判据**推（`deriveHasMore`）。
   代价是最后一批恰好凑满 10 条时多一次空请求（点一下没反应），这是没有 total 时无法避免的。
5. **`/review/hot` 返回的是平铺形状**：作者是 `userId`/`name`/`icon` 三个平铺字段，
   `images` 是逗号串，`content` 是 **HTML 片段**（实测只有 `<br/>`，40 + 29 个）。
   **必须过 `adapt.ts` 的 `reviewFromDTO()`** ——
   直接当 `Review` 用会让 `ReviewFeed` 读 `undefined.nickName` 抛 TypeError，
   **首页口碑区整块从 DOM 消失**，而控制台只有一条不显眼的错误。
   这条是 2026-10-16 真实踩到的（M1 时期没暴露，因为默认走 mock，而 mock 数据本来就是 `Review` 形状）。

   > **为什么 `<br/>` 也归适配层管**：`Review.content` 的语义**由 mock 定义**（7 条全是纯文本，
   > 零标签）。真机给 HTML、mock 给纯文本，同一个字段两种含义 —— 这与逗号串→数组是同一类问题。
   > 不处理的表现是用户看见字面的「一半烟火`<br/>`一半诗意」。
   >
   > 但它**不是 sanitizer**：只吃换行标签，别的标签原样留着。M4 要渲染富文本时应该去用原始的
   > `BlogDTO`，而不是把这个函数扩成清洗器 —— 一个悄悄改写用户内容的适配层，
   > 比一个显示得不够漂亮的页面危险得多。
6. **`GET /car/{id}` 走的是「逻辑过期」缓存，冷缓存下直接返回 `车源不存在`。**
   `CacheClient.queryWithLogicalExpire` 命中不了就 `return null`，**不回查数据库**
   （假设已被预热）。所以**清掉 `cache:car:*` 后必须重灌**，否则车源列表正常、详情页全挂：
   `../server/scripts/init-car-cache.sh`（它自己就是先清空再重建，不要再单独 `del` 一次）。
   2026-10-16 踩到：改坐标时按旧步骤清了缓存，14 个详情全变「车源不存在」。
   预热一次即可 —— 值的 `expireTime` 到点后下一次读会拿互斥锁异步回源，之后自维持。

> **秒杀只有三条错误消息**：`库存不足` / `禁止重复下单` / `优惠券不存在或库存未预热`。
> 前端文案照这三条写，**不要写「秒杀尚未开始/已结束」** ——
> 后端的线上路径**不校验时间窗**（`秒杀尚未开始/结束` 只存在于被注释掉的同步实现里）。
> `car.ts` 的 `isSeckillLive` 是**前端自己**的判据，比后端更严：不给一个点下去会成功的过期按钮。

#### 3.2 车源坐标：刻意集中在 3 个城市，改一处必须改两处

14 台车只落在 **上海 5（1/2/3/7/9）、北京 5（6/11/12/13/14）、深圳 4（4/5/8/10）**，
同城车辆彼此相距 2 km 上下。

**为什么必须集中**：`/car/list` 的半径是**硬编码**的 5 km
（`CarServiceImpl.java` 的 `new Distance(5000)`，没有参数可调）。原先 14 台散在
8 个城市、多数城市只有 1 台，「附近优先」在任何城市都只能查出 1 台 —— 看着像坏了。
集中之后站在深圳南山是 4 台、上海人民广场是 5 台，`car.spec.ts` 有一组用例把这个分布锁住了
（改了某台车的城市会立刻红）。

**代价**：这 3 城之外的定位查出来就是空的。列表页有空态文案说明这件事，
**不能静默退回全部车源**（静默降级是最坑的一种失败，因为它没有任何症状）。

**坐标存在两个地方，必须同步改**：

| 位置 | 作用 |
|---|---|
| `../server/usedcar.sql` 的 `tb_shop.x/y`（连同 `address`） | 真机数据源 |
| `src/api/mock.ts` 的 `mockCarCoords`（连同 `mockCars[].address`） | mock 数据源 |

`car.ts` 的 `nearbyCars` 用同一套半径与球面距离现算，所以两处一致时
「同一个定位 → 同一批车」在两种模式下逐台对应 —— 这正是一条 E2E 判据
（深圳定位恰好 4 台，mock 与真机都验）。只改一处，mock 就只是「看起来能点」。
`address` 也必须跟着改：界面不显示坐标，但详情页显示地址，两者对不上就是
「深圳的车写着杭州的地址」。

### 4. 动效降级

`prefers-reduced-motion` 必须降级。只动 `transform` / `opacity`，不动 `width` / `top` / `margin`。

### 5. 开场与转场

**开场是白幕溶解**（2026-10-16 由黑幕开合改写）：全屏纯白 → AXLE 字标逐字浮现 →
幕布整体淡出，首屏从底下交叉溶解进来。全站纯白底，黑幕在白站上读起来像加载失败的故障态；
白幕与页面同色，「揭幕」才是溶解而不是「抽走一块板子」。

**每次完整文档加载都放，不分路由、不看是否本会话第一次。** 「开场是进入体验的门」，
而「进入」= 一次完整文档加载；站内 SPA 导航不重新执行 `index.html`，天然不会放。
**不要再用 `sessionStorage` 记「已放过」** —— 那会让刷新也不再放，而刷新恰恰是最常见的
「重新进入」，等于把门焊死。`?nointro` 是开发用的跳过开关，`prefers-reduced-motion` 下不放。

放不放的判断只写在 `index.html` 的 `<head>` 内联脚本里（它必须早于 bundle、也必须早于
字体 `<link>` —— 浏览器会阻塞普通 `<script>` 直到前面的样式表就绪），`src/lib/intro.ts`
只读它留下的 `intro-boot` class —— **判断逻辑只有一份，两边都要改就是 bug**。
时序表与「交接点为什么压在淡出前段」见 `../docs/specs/` §6.4。

`SiteLayout` 由 `App.vue` 包住 `RouterView`，**view 里不要再包一层** ——
每个 view 各包一层会让换路由时 header/footer 一起重建，转场就没法做。
`<main>` 的 `min-h-[100svh]` 是 `mode="out-in"` 的配套：否则旧内容卸载的瞬间
main 塌成 0 高，footer 会跳到页首。

切路由后必须显式 `lenis.scrollTo(0, { immediate: true })` —— router 的 `scrollBehavior`
走 `window.scrollTo`，Lenis 的内部 `targetScroll` 不跟着变，下一帧会被拉回去。
**所以 router 里没有 `scrollBehavior`，别再往 `router/index.ts` 里加回去**；
归零挂在 `App.vue` 的 `<Transition @after-leave>` 上（不能挂在路由 watcher 上，
`out-in` 的 0.3s 离开期间滚到顶会被看见）。

转场 CSS（`.route-*-active` / `.route-*-from` / `.route-*-to`）必须在全局 `main.css`，
不能写进任何组件的 `<style scoped>` —— `<Transition name="route">` 由 `App.vue` 直接渲染，
没有 scoped 宿主，写进去匹配不到，表现为「转场静默失效」。

### 6. 滚动入场（`data-reveal`）的三条纪律

`[data-reveal]` 元素的初始 `opacity: 0` 是 **`main.css` 的 CSS 规则**给的，不是内联样式 ——
入场动画由 `useReveal` 把 opacity 补间到 1。于是有三条不能破的纪律：

**① 每个渲染 `data-reveal` 的组件都必须自己调 `useReveal`。**

缺了 JS 那一半，元素就是**永久隐形**的，而且几乎查不出来：不报错、DOM 里文字都在、
`textContent` 取得到、`getBoundingClientRect()` 也量得出正常尺寸 —— 只有截图上是一片空白。
更坑的是 `prefers-reduced-motion` 下 main.css 的兜底会把它设成 `opacity: 1`，
**只测减弱动效永远发现不了**。

2026-10-16 就这么漏过一次：`SpecTable.vue` / `VoucherCards.vue` 写了 `data-reveal`
却没人调 `useReveal`，详情页整页只剩 hero 与页脚可见。现在由
`src/composables/useReveal.spec.ts` 静态扫描所有 `.vue` 守着这条配对，别再绕过它。

**② 一个 `data-reveal` 只能有一个宿主。** 谁渲染这块标记谁负责揭开它；
两层同时 reveal 会在同一元素上叠两个补间 —— 不报错，但会抖。

**③ 任何在挂载之后被换掉内容的列表，必须让宿主组件重新挂载。**

否则新元素拿到 CSS 给的 `opacity: 0`，背后却没有任何动画去揭开它们 —— 整个列表隐形。

现例：`HomeView` 切大类时 `<FeaturedCars :key="kind" :cars="cars" />`。两条纪律：

- `:key` 要跟着**数据**变，不能跟着别的状态变
- 换数据与换 key 必须在**同一个 tick** 里赋值（`cars.value = list` 后再 `kind.value = next`，
  中间不许 `await`）。先换 key 会让组件带着旧数据重挂一次，动画就作用在旧卡片上了

> **内容异步到达时用 `useReveal` 的 `ready` 选项**：视图先挂载、数据后到的话，
> `onMounted` 那一刻容器里一个 `[data-reveal]` 都没有，早退之后就再没人揭开了。
> `CarDetailView` 给内联的「车源所在地」块传 `ready: loaded` 就是为这个。

## 目录

```
src/
├── api/          client.ts（axios 实例 + **USE_MOCK 的唯一读者**）/ adapt.ts（**唯一允许做字段映射的地方**）
│                 car.ts / review.ts / social.ts / user.ts / order.ts /
│                 mock.ts（静态种子）/ mockSocial.ts（**有状态**的社交 mock 后端）/ types.ts（*DTO = 后端原样形状）
├── components/
│   ├── ui/       通用组件：AppButton / AppField / AppTag / SkeletonBlock / StatCount
│   └── business/ 业务组件：HeroSection / IntroCurtain / KindTabs / BrandNav / FilterBar / CarCard /
│                 FeaturedCars / ReviewFeed / ReviewCard / FollowButton / CarHero / SpecTable /
│                 VoucherCards / StickyBuyBar
├── composables/  useCountUp / useReveal（+ useReveal.spec.ts 守 data-reveal 配对）/ useCountdown /
│                 useScrollTo / useRequireLogin（需登录视图的统一入口）
├── layouts/      SiteLayout（全站唯一布局，App.vue 用它包住 RouterView）
├── lib/          gsap / lenis / intro 单例，fit.ts（车台面积归一公式），time.ts（日期口径，别在组件里重复实现），
│                 flip.ts（手写共享元素转场，细节见 specs §6.4），carName.ts（展示名口径），phone.ts（手机号校验）
├── router/
├── stores/       auth.ts —— **项目唯一的 Pinia store**（边界见下）
├── styles/       tokens.css（设计 token）+ main.css
└── views/        HomeView（M1）/ CarDetailView（M2）/ LoginView / SeckillView / CarListView（M3）
                  / ReviewListView / ReviewDetailView / ReviewEditView / FeedView / DealerView（M4）
                  / MeView / MeEditView（M5）/ PlaceholderView（只剩 404 在用）

public/cars/      车辆原图（jpg）+ 抠图产物（cut/*.webp）
（设计文档与截图不在前端目录，统一放在仓库根 `../docs/`：specs / plans / screenshots）
```

### 什么时候用 Pinia，什么时候用 `lib/` 单例

**判据只有一条：这份状态要不要驱动别的组件重渲染。**

- 要 → **Pinia**（`stores/`）。目前只有 `auth.ts`：登录态要驱动 header 换昵称/头像。
- 不要 → **`lib/` 模块单例**（`gsap` / `lenis` / `intro`）。它们持有的是瞬态数据，
  改动时没有视图需要跟着变，塞进 Pinia 只是多一层间接。

**不要**因为「项目里有个 `stores/`」就把什么都往里面放 —— 这条边界写在这里，
就是因为下一个人很容易以为项目风格是「一律模块单例」或反过来「一律 Pinia」。

### 三条 M3 立下的约定

1. **`adapt.ts` 是唯一允许做字段映射的地方。** 后端形状 → 展示模型的换算
   （逗号串→数组、分→元、评分÷10、平铺作者→嵌套 `author`、`cutout` 按命名约定推导）
   全部收在这一个文件；在组件里写 `car.images as unknown as string[]` 或散落的 `/100`
   等于把这一层架空，漏一处就是详情页白屏或整块 section 消失。
   **反向也成立**：`Car` / `Brand` / `Review` 不要去兼容后端形状
   （别把 `images` 声明成 `string | string[]`）—— 那会把「有两种形状」推给每个读类型的人。
2. **表单控件的样式与错误位只写在 `AppField.vue` 里。** 项目此前零表单控件，M3 的登录页
   是第一个，所以这一步是**立约定**而不是加一个组件：label + input + 错误位 + 统一的
   focus/disabled 样式全收在那一个文件。**只允许零彩色** —— 错误态靠 `border-fg` 加深 +
   文案，**不用红色**（见 §1 零彩色 UI）。
3. **401 的统一处理挂在 `main.ts` 注入的 `setUnauthorizedHandler` 上，不在 `client.ts` 里
   import router。** `router → views → api` 会成环，所以由 `main.ts` 单向下行注入。
   `client.ts` 只负责在拿到 401 / `NeedLoginError` 时调用那个 handler。

### M4/M5 立下的约定（口碑 / 关注 / 签到）

1. **`mockSocial.ts` 是「有状态的 mock 后端」，`mock.ts` 只放静态种子。**
   点赞数、关注关系、签到、发口碑都会改内存状态，且必须与真机**语义**一致：
   点赞是切换不是累加、同一天重复签到幂等、关注重复调用不翻倍。
   `mock.ts` 里的静态口碑数量与 `mockSocial.ts` 的种子必须对得上 ——
   两处各写一份数字，第一次点赞就会跳变。
2. **Feed 的游标必须原样回传。** 响应是 `{list, minTime, offset}`，
   下一页请求就带 `lastId=minTime&offset=offset`。不要改写成页码 —— 后端按 ZSET 分数倒序取，
   页码语义不存在。空 feed 返回 `Result.ok()`，`data` 是 `null`，前端按空列表处理。
3. **公开页与登录页要分开处理，不能让访客看到报错。**
   `/dealer/:id` 的资料与口碑是公开的，只有「关注 / 共同关注」需要登录 ——
   访客进来应该看到完整主页，社交按钮隐藏或引导登录，而不是整页 401。
   点赞、发口碑、签到这类写操作才用 `NeedLoginError` 走登录跳转。
4. **签到状态用「连续签到天数 > 0」推，不要自己维护布尔值。**
   后端 `GET /user/sign/count` 的语义是「从今天往前连续签到几天」，今天没签就是 0。
   签到成功后**重新请求 count**，不要在本地 +1 —— 本地加会在断签后算错。
5. **需登录的视图统一走 `useRequireLogin().ensure()`**，它负责跳登录并带回跳地址；
   不要在每个 view 里手写 `if (!auth.token) router.push('/login')`。
6. **上传图片落盘在 classpath 外**（`server/uploads/imgs`），开发时由 Vite proxy 的
   `/imgs` 规则转发到 8081（无 rewrite）。生产由后端 `MvcConfig` 直接映射。

## 分档

只有 3 个旗舰页做满电影级动效，其余克制：

| 旗舰页（滚动叙事） | 功能页（骨架屏/stagger） |
|---|---|
| `/` 首页、`/car/:id` 详情、`/seckill/:id` 抢购 | 其余 9 页 |

底色全站统一白，分档只体现在**节奏**上：旗舰页有滚动叙事和大图，功能页保信息密度与可用性。

## 素材

**完整规格见 `../docs/specs/2026-10-15-二手车平台-design.md` §3.6 / §3.7**，换图前先读那两节。要点：

- **别找「已经是透明 PNG」的图** —— 那类站基本禁商用（pngimg 是 CC BY-NC 4.0）。
  找一张干净的实景照（Unsplash / Pexels 免费商用），抠图交给 `scripts/cutout-cars.py`。
- 放 `public/cars/`，命名 `品牌-车型.jpg`（kebab-case），跑抠图生成 `public/cars/cut/*.webp`，
  再到 `src/api/mock.ts` 加条目。
- 源图**长边 ≥ 2500px**：抠图产物封顶 1600px，首屏够用。
  **详情页 hero 走原图不走抠图**（`object-cover`，3000–7680px 足够 DPR2），所以「提到 2800
  重跑流水线」只在对抠图有需求时才做 —— 详见 specs §3.6 的补充说明，别照旧结论执行。
- 选图比分辨率重要：正侧或轻微 3/4、**整车完整入画且四周留白**（贴边会被切）、
  背景干净、投影轻、画面里不要有人或第二台车（最大连通域会选错主体）。
- 筛图用 `--check`，别等抠完才发现不能用：

  ```bash
  .cutout-venv/bin/python scripts/cutout-cars.py --check --src public/cars
  ```

- **`--check` 是筛子不是判官**：它查不出「背景结构物与车身连成一片」——
  玻璃幕墙、招牌、栏杆与车顶在像素上连通时，抠图会把它们当成车顶行李架糊上去，
  而连通域/半透明/长宽比指标全绿。**抠完必须做两件事，缺一不可**：
  ① 轮廓最后几行宽度单调收窄到接近 0（否则是「少轮子」：轮廓被一条水平线切断）；
  ② **合成到深底上放大到 ≥600px 人眼看**（白底会把混进来的浅色地面、阴影藏起来，
  深底让非车身像素现形）。缩略图两样都看不出来。
- **`cutout` 字段的语义是「这台车能上首屏」**，不是「这台车有抠图」——
  它唯一的下游是 `HeroSection`（`cutout ?? images[0]`），卡片一律用原图。
  抠图脏就撤掉这个字段，宁可缺；留着等于在数据里说谎。入选口径只有「抠图干净」一条
  （§3.7），**车头朝向不作要求**。

**`mockCars[].images[0]` 必须指向真实存在的文件。** 指向已删文件的卡片会静默渲染成空图，
不报错 —— 换素材时这是要跟着改的，不是「反正 mock 无所谓」。

现有素材是**演示用占位素材**，来自公开图库与网络，**来源与授权未核实**，部分含厂商标识与车牌。
仓库公开不等于这些图可商用。这批照片是「平光记录照」，调性由界面统一：局部裁切 + 底部渐变遮罩
（列表卡片）；首屏走抠图路线放在白底上。素材可整体替换，动效与设计语言不依赖具体图。
