# hmdp-web — 二手车平台前端（作品集级动效）

基于 `../hmdp-master`（完整版后端，分支 `usedcar`）的 Vue3 重写。把「本地生活点评」的
功能语义映射到「二手车交易」：一辆车只能卖给一个人，秒杀 + 一人一单在这里完全自洽。

## 分支

`main` 为工作分支。设计文档 `docs/specs/`，实现计划 `docs/plans/`。

## 技术栈

Vue 3.5（`<script setup>`）/ Vite / TypeScript / Pinia / Vue Router
Tailwind CSS v4（`@tailwindcss/vite` 插件）/ GSAP 3.15 全插件 / Lenis / axios

> **为什么只有 GSAP 一套动效引擎**：`motion`（原 Framer Motion）自 14.x 起已移除 Vue 支持，
> Vue 版是独立包 `motion-v`。不用它的原因不是它不好，而是没必要——GSAP 3.13 起被 Webflow
> 收购后全部插件开源免费，`Flip`（共享元素转场）、`SplitText`（逐字动画）、`ScrollTrigger`
> （滚动叙事）完整覆盖需求，且与 Lenis 共用同一个 ticker。两套引擎并存只会互相抢 rAF 帧。

## 命令

```bash
pnpm dev          # 开发服务器 5173，/api 反代到后端 8081
pnpm typecheck    # vue-tsc --noEmit
pnpm build        # 类型检查 + 构建
pnpm test         # vitest

# 验收截图：驱动系统 Chrome 拍首页各段落，人工看效果。
# 这是「改完必须亲眼看」的抓手 —— 构建通过不等于页面是对的。
node scripts/screenshot.mjs                 # 默认 http://localhost:5173/ → /tmp/hmdp-shots
node scripts/screenshot.mjs <url> <outDir>  # 换目标
```

后端必须先起：`cd ../hmdp-master && mvn spring-boot:run`（端口 8081）。
后端不通时页面走 mock 数据，不报错。

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
- 免登录路径仅：`/user/code` `/user/login` `/blog/hot` `/shop/**` `/shop-type/**` `/upload/**` `/voucher/**`
- 秒杀返回订单 id ≠ 已落库（Redis Stream 异步），**不要拿返回值立刻查订单**
- Feed 流分页是 `lastId + offset`，不是 `current` 页码
- GEO 附近车商需要 `navigator.geolocation` 坐标，不给坐标退化成普通分页

### 4. 动效降级

`prefers-reduced-motion` 必须降级。只动 `transform` / `opacity`，不动 `width` / `top` / `margin`。

### 5. 开场与转场

**开场黑幕只在「首页 + 本次会话首次访问 + 无 `prefers-reduced-motion`」时放**，
深链与二次导航都不放。放不放的判断只写在 `index.html` 的 `<head>` 内联脚本里
（它必须早于 bundle 执行才能防首帧白闪），`src/lib/intro.ts` 只读它留下的
`intro-boot` class —— **判断逻辑只有一份，两边都要改就是 bug**。

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

### 6. 列表重新渲染必须换 key

`[data-reveal]` 元素的初始 `opacity: 0` 是 **`main.css` 的 CSS 规则**给的，不是内联样式 ——
入场动画由 `useReveal` 在 `onMounted` 里跑一次，把 opacity 动画到 1。

所以：**任何在挂载之后被换掉内容的列表，必须让宿主组件重新挂载**，否则新元素拿到
CSS 给的 `opacity: 0`，背后却没有任何动画去揭开它们 —— 整个列表隐形，而且控制台一片安静。

现例：`HomeView` 切大类时 `<FeaturedCars :key="kind" :cars="cars" />`。两条纪律：

- `:key` 要跟着**数据**变，不能跟着别的状态变
- 换数据与换 key 必须在**同一个 tick** 里赋值（`cars.value = list` 后再 `kind.value = next`，
  中间不许 `await`）。先换 key 会让组件带着旧数据重挂一次，动画就作用在旧卡片上了

## 目录

```
src/
├── api/          接口层，按后端模块分文件；client.ts 是 axios 实例
├── components/
│   ├── ui/       通用组件：AppButton / AppTag / SkeletonBlock / StatCount
│   └── business/ 业务组件：HeroSection / IntroCurtain / KindTabs / BrandNav / CarCard / FeaturedCars / ReviewFeed
├── composables/  useCountUp / useReveal / useScrollTo
├── layouts/      SiteLayout（全站唯一布局，App.vue 用它包住 RouterView）
├── lib/          gsap / lenis / intro 单例，fit.ts（车台面积归一公式）
├── router/
├── styles/       tokens.css（设计 token）+ main.css
└── views/

public/cars/      车辆原图（jpg）+ 抠图产物（cut/*.webp）
docs/             specs/ 设计文档、plans/ 实施计划、screenshots/ README 用图
```

## 分档

只有 3 个旗舰页做满电影级动效，其余克制：

| 旗舰页（滚动叙事） | 功能页（骨架屏/stagger） |
|---|---|
| `/` 首页、`/car/:id` 详情、`/seckill/:id` 抢购 | 其余 9 页 |

底色全站统一白，分档只体现在**节奏**上：旗舰页有滚动叙事和大图，功能页保信息密度与可用性。

## 素材

**完整规格见 `docs/specs/2026-10-15-二手车平台-design.md` §3.6 / §3.7**，换图前先读那两节。要点：

- **别找「已经是透明 PNG」的图** —— 那类站基本禁商用（pngimg 是 CC BY-NC 4.0）。
  找一张干净的实景照（Unsplash / Pexels 免费商用），抠图交给 `scripts/cutout-cars.py`。
- 放 `public/cars/`，命名 `品牌-车型.jpg`（kebab-case），跑抠图生成 `public/cars/cut/*.webp`，
  再到 `src/api/mock.ts` 加条目。
- 源图**长边 ≥ 2500px**：抠图产物封顶 1600px，首屏够用，但 M2 详情页 DPR2 下要 2880px。
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
