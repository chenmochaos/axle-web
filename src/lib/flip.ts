/**
 * 共享元素转场（FLIP）—— 手写的那一套。
 *
 * 场景：点列表卡片 → 详情页 hero 大图。图从卡片的位置「长」成 hero 的位置。
 *
 * ── 为什么不用 `gsap/Flip` 插件 ──────────────────────────────────
 *
 * GSAP 的 Flip 插件用法是：离开前 `Flip.getState(el)` 记下状态，到新页面
 * `Flip.from(state)` 播回来。它要求**被记录的元素在播放时仍在文档里**（或者依赖
 * 未文档化的「按 DOM 顺序找回」行为）。
 *
 * 而本项目的路由转场是 `<Transition mode="out-in">`：旧页先完整卸载（0.3s），
 * 再挂载新页。也就是说详情页 hero 挂载时，卡片**早就从文档里消失了**。
 * 能不能靠 GSAP 的未文档化行为救回来是没有保证的 —— 赌它不如自己算。
 *
 * 而且 FLIP 的数学本来就只有四条：位置差两个、缩放比两个。抽成纯函数还能单测，
 * 这比依赖插件内部行为划算。
 *
 * ── 契约 ────────────────────────────────────────────────────────
 *
 * `recordFlipSource(card)` 在**点击那一刻**记下卡片的矩形（此时它还在文档里，量的准）；
 * `consumeFlipSource(id)` 在详情页挂载时取出来。中间隔着一次路由转场，纯内存传递。
 *
 * **id 是承重件，不是装饰**：`data-flip-id` 从「预埋的意图」变成「这段矩形属于哪台车」
 * 的凭据。id 不匹配就丢弃 —— 刷新、直连、前进后退、点了另一台车，都要落回这一条。
 *
 * ── 已知局限（不假装无缝）────────────────────────────────────────
 *
 * 卡片图是 `aspect-[4/3] object-cover`，hero 是宽幅 `object-cover`，两者裁切比例不同。
 * 补间期间图片整体缩放，画面里**看到的内容**与卡片上的裁切不完全一致，
 * 靠 0.4–0.8s 的高速运动盖过去。要做到像素级无缝得让 hero 也用 4:3 ——
 * 那是构图上的倒退（详情页要宽幅叙事），不做。
 */

/** 只取 FLIP 用得到的四个量。用结构类型而不是 DOMRect，纯函数才能脱离 jsdom 测 */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface FlipSource {
  /** 应当等于对应元素的 `data-flip-id` */
  id: string
  /** 记录时的视口坐标 */
  rect: Rect
}

export interface FlipTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
}

/** 全站唯一的 id 拼法。卡片与详情页各写一遍就会对不上，而失败是静默的（动画不播而已） */
export function flipId(carId: number | string): string {
  return `car-image-${carId}`
}

/**
 * 面积小于这个值（px²）的矩形视作「当时不可见」，不播动画。
 *
 * 不能只判 `width === 0`：`display: none` 与 `visibility: hidden` 给的都是全零矩形，
 * 但**被 `content-visibility` 或父级裁剪跳过的元素**可能给出一条 0 高但非 0 宽、
 * 或者反过来 0 宽非 0 高的矩形。面积判据一次覆盖全部这三种。
 */
const MIN_AREA = 1

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

function area(r: Rect): number {
  return Math.abs(r.width) * Math.abs(r.height)
}

let pending: FlipSource | null = null

/**
 * 记下卡片的矩形。**在点击那一刻调用** —— 之后 `mode="out-in"` 会先卸载整页，
 * 元素没了就再也量不到了。
 *
 * 元素的 `data-flip-id` 就是 id；没有这个属性则不记录（转场直接跳过，不报错）。
 */
export function recordFlipSource(el: Element | null | undefined): void {
  if (!el) return
  const id = (el as HTMLElement).dataset?.flipId
  if (!id) return

  const rect = rectOf(el)

  // 当时不可见就别记 —— 记下来只会让详情页从一个 0×0 的点「长」出来，像故障
  if (area(rect) < MIN_AREA) {
    pending = null
    return
  }

  pending = { id, rect }
}

/**
 * 取出记录并**清空**（无论是否命中）。
 *
 * - id 不匹配 → 返回 null。刷新、直连、前进后退、点了另一台车，都落在这里。
 * - 无记录 → null。
 *
 * 清空是必须的：留着它，下一次导航到同一台车时会从一个几秒前的矩形起飞。
 *
 * **减弱动效不在这里判** —— 这里只管「有没有合法的源」，要不要播是调用方的事。
 * 但调用方必须**无条件**调用本函数（哪怕打算跳过动画），否则过期的矩形会一直挂着。
 */
export function consumeFlipSource(id: string): FlipSource | null {
  const source = pending
  pending = null
  return source && source.id === id ? source : null
}

/** 丢弃记录而不消费。给测试与「导航被取消」这类收尾用 */
export function forgetFlipSource(): void {
  pending = null
}

/**
 * 把一个**此刻位于 `to`** 的元素变换成「看起来在 `from`」所需的 transform。
 *
 * 配合 `transform-origin: 0 0` 使用 —— 返回的 `x`/`y` 就是以 `to` 的左上角为原点算的，
 * 缩放不会污染位移分量。若用默认的 `center` 原点，位置差还要减去
 * `(1 - scale) * size / 2` 的补偿项，等于把同一件事算两遍。
 *
 *   x      = from.left - to.left
 *   y      = from.top  - to.top
 *   scaleX = from.width  / to.width
 *   scaleY = from.height / to.height
 *
 * `to` 任一维非正时返回**单位变换**而不是 `Infinity`/`NaN`：目标元素还没布局
 * （宽度 0）时，宁可「不缩放」也不要往 DOM 里写一个会让整块消失的 transform。
 */
export function flipTransform(from: Rect, to: Rect): FlipTransform {
  if (to.width <= 0 || to.height <= 0) {
    return { x: 0, y: 0, scaleX: 1, scaleY: 1 }
  }

  return {
    x: from.left - to.left,
    y: from.top - to.top,
    scaleX: from.width / to.width,
    scaleY: from.height / to.height,
  }
}
