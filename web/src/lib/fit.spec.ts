import { describe, it, expect } from 'vitest'
import { fitByArea, STAGE_FILL } from './fit'

/** 现有素材的真实长宽比（抠图产物实测，见 ../docs/specs §3.6） */
const RATIOS = [1.56, 1.92, 1.98, 2.0, 2.11, 2.15, 2.2, 2.25, 2.31, 2.33]

const fitArea = (r: number, w: number, h: number, fill?: number) => {
  const f = fitByArea(r, w, h, fill)
  return f.width * f.height
}

describe('fitByArea', () => {
  it('同一车台下所有车面积相同 —— 这是这个函数存在的理由', () => {
    const areas = RATIOS.map((r) => fitArea(r, 1000, 333))
    expect(Math.max(...areas) / Math.min(...areas)).toBeCloseTo(1, 6)
  })

  it('高瘦车不再比宽体车小一号（旧的高度归一极差是 1.48 倍）', () => {
    expect(fitArea(1.56, 1000, 333) / fitArea(2.33, 1000, 333)).toBeCloseTo(1, 6)
  })

  it('车台压到 800px 视口那档时最瘦长的车触顶、面积略小 —— 文档写的 1.08 倍', () => {
    expect(fitArea(2.33, 1000, 296) / fitArea(1.56, 1000, 296)).toBeCloseTo(1.083, 2)
    expect(fitByArea(1.56, 1000, 296).height).toBeCloseTo(296, 6)
  })

  it('长宽比只改变形状：宽体更宽更矮，高瘦更窄更高', () => {
    const wide = fitByArea(2.33, 1000, 333)
    const tall = fitByArea(1.9, 1000, 333)
    expect(wide.width).toBeGreaterThan(tall.width)
    expect(wide.height).toBeLessThan(tall.height)
  })

  it('宽度恒等于高度乘长宽比 —— 形状不能被拉变形', () => {
    for (const h of [120, 200, 296, 333, 368]) {
      for (const r of [0.8, 1.2, 1.56, 3.0, 5.0]) {
        const f = fitByArea(r, 1000, h)
        expect(f.width / f.height).toBeCloseTo(r, 6)
      }
    }
  })

  it('高度永不超过车台高度', () => {
    for (const h of [120, 200, 296, 333, 368]) {
      for (const r of [0.8, 1.2, 1.56, 3.0, 5.0]) {
        expect(fitByArea(r, 1000, h).height).toBeLessThanOrEqual(h + 1e-9)
      }
    }
  })

  it('竖构图的图也触顶，且不产生负值', () => {
    const f = fitByArea(0.8, 320, 120)
    expect(f.height).toBeCloseTo(120, 6)
    expect(f.width).toBeCloseTo(96, 6)
  })

  it('ratio 坏值（图还没 load）回落成正方形，不产生 NaN 尺寸', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const f = fitByArea(bad, 1000, 333)
      expect(Number.isFinite(f.width)).toBe(true)
      expect(Number.isFinite(f.height)).toBe(true)
      expect(f.width).toBeGreaterThan(0)
    }
  })

  it('车台尺寸还是 0（ResizeObserver 没回报）时不炸', () => {
    const f = fitByArea(2, 0, 0)
    expect(f.width).toBe(0)
    expect(f.height).toBe(0)
  })

  it('STAGE_FILL 可显式传参，方便调参', () => {
    expect(fitArea(2, 1000, 333, 0.8)).toBeGreaterThan(fitArea(2, 1000, 333, 0.4))
    expect(STAGE_FILL).toBe(0.5)
  })
})
