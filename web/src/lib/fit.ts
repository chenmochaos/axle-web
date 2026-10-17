/**
 * 车台内的尺寸归一。
 *
 * 车台盒子尺寸写死（`.hero-stage`），车图在里面按**面积**归一 ——
 * 同一车台里所有车占据相同面积，长宽比只决定它是宽而扁还是高而窄。
 *
 * 为什么不是按高度归一（2026-10-16 改判）：盒子高度写死意味着「车高恒等于盒子高」，
 * 于是车的面积完全被长宽比决定。改判时那批素材长宽比 1.56–2.33，同样的盒子高度下
 * 面积差 1.48 倍 —— 最瘦的那台看起来就是小一号，这是 Minus 报的问题。
 * 别改回 `object-contain` 一把梭。
 *
 * 公式 h = sqrt(A / r) 里 A 取车台面积的一半。**0.5 这个系数是按当时的素材挑的**
 * （让最瘦的 1.56 在 900px 高视口下刚好不触顶：需要 327px，车台 333px）。
 * 现在的池子里，汽车长宽比 1.85–2.53、摩托 1.14–1.71，都比 1.56 瘦或接近，
 * 于是**车台高度 333px 下只有 r > 1.50 不触顶**：摩托会触顶、面积小一截
 * （675SR 91%、CBR1000RR-R 76%）。这是有意的降级，不是 bug ——
 * 图片必须保持形状，宁可让窄高的车小一点，也不能拉扁。
 *
 * 想让首屏那四台面积严格相等就把 STAGE_FILL 降到 0.45 以下（阈值 r < 1.35），
 * 代价是所有车一起小 5%。改之前先量，别凭空调。
 *
 * `scripts/cutout-cars.py --check` 用同一套公式预估首屏渲染尺寸（那里 STAGE_H 取 333），
 * 改这里的系数或车台的 CSS 高度时记得同步过去。
 */

/** 目标面积占车台面积的比例。与车台的 `h-[clamp(13rem,37vh,23rem)]` 是一组，一起调。 */
export const STAGE_FILL = 0.5

export interface Fit {
  width: number
  height: number
}

/**
 * 按面积归一出车图在车台里的渲染尺寸（px）。
 *
 * @param ratio  车图自身长宽比（naturalWidth / naturalHeight）
 * @param stageW 车台宽（px）
 * @param stageH 车台高（px）
 */
export function fitByArea(
  ratio: number,
  stageW: number,
  stageH: number,
  fill: number = STAGE_FILL,
): Fit {
  // 图还没 load 完时 ratio 是 NaN/0，此时回落成正方形，至少不会算出 NaN 尺寸
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1

  let height = Math.sqrt((stageW * stageH * fill) / r)
  let width = height * r

  // 触顶：按高度等比缩小（形状不能变，否则车会被拉扁）
  if (height > stageH) {
    width *= stageH / height
    height = stageH
  }

  return { width, height }
}
