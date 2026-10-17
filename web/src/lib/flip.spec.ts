import { describe, it, expect, beforeEach } from 'vitest'
import {
  consumeFlipSource,
  flipId,
  flipTransform,
  forgetFlipSource,
  recordFlipSource,
  type Rect,
} from './flip'

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
})

/** jsdom 的 getBoundingClientRect 恒返回全零，要测就得自己钉一个 */
function card(id: string | null, box: Rect): HTMLElement {
  const el = document.createElement('div')
  if (id) el.dataset.flipId = id
  el.getBoundingClientRect = () => ({ ...box, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) })
  return el
}

beforeEach(() => forgetFlipSource())

describe('flipTransform', () => {
  it('同一个矩形 → 单位变换', () => {
    const r = rect(10, 20, 300, 200)
    expect(flipTransform(r, r)).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1 })
  })

  it('尺寸相同只有位置不同 → 纯位移，不缩放', () => {
    expect(flipTransform(rect(100, 400, 300, 200), rect(0, 80, 300, 200))).toEqual({
      x: 100,
      y: 320,
      scaleX: 1,
      scaleY: 1,
    })
  })

  it('等比放大：位移以 to 的左上角为原点，不含缩放补偿', () => {
    // 卡片 300×200 长到 1200×800（4×），to 在 (0,0) → 位移是 from 的位置本身
    const t = flipTransform(rect(240, 360, 300, 200), rect(0, 0, 1200, 800))
    expect(t).toEqual({ x: 240, y: 360, scaleX: 0.25, scaleY: 0.25 })
  })

  it('不等比缩放：宽高各算各的', () => {
    // 卡片 4:3 → hero 宽幅，正是本项目的真实情形
    const t = flipTransform(rect(0, 300, 400, 300), rect(0, 0, 1440, 480))
    expect(t.scaleX).toBeCloseTo(400 / 1440)
    expect(t.scaleY).toBeCloseTo(300 / 480)
  })

  it('位移与 to 的位置相关 —— to 右移 100，x 就少 100', () => {
    const size = [200, 200] as const
    const a = flipTransform(rect(0, 0, ...size), rect(0, 0, 400, 400))
    const b = flipTransform(rect(0, 0, ...size), rect(100, 0, 400, 400))
    expect(a.x - b.x).toBe(100)
  })

  it('to 宽或高为 0（还没布局）→ 单位变换，不产生 Infinity/NaN', () => {
    const identity = { x: 0, y: 0, scaleX: 1, scaleY: 1 }
    expect(flipTransform(rect(0, 0, 100, 100), rect(0, 0, 0, 100))).toEqual(identity)
    expect(flipTransform(rect(0, 0, 100, 100), rect(0, 0, 100, 0))).toEqual(identity)
    expect(flipTransform(rect(0, 0, 100, 100), rect(0, 0, 0, 0))).toEqual(identity)
  })

  it('to 尺寸为负（异常值）也退回单位变换', () => {
    expect(flipTransform(rect(0, 0, 100, 100), rect(0, 0, -50, -50))).toEqual({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
    })
  })

  it('from 退化成 0 宽 → scaleX 为 0（合法的塌缩，不是错误）', () => {
    const t = flipTransform(rect(10, 10, 0, 100), rect(0, 0, 100, 100))
    expect(t.scaleX).toBe(0)
    expect(t.scaleY).toBe(1)
  })
})

describe('recordFlipSource / consumeFlipSource', () => {
  it('id 匹配时返回记录的矩形', () => {
    recordFlipSource(card(flipId(5), rect(120, 640, 400, 300)))
    expect(consumeFlipSource('car-image-5')).toEqual({
      id: 'car-image-5',
      rect: rect(120, 640, 400, 300),
    })
  })

  it('id 不匹配 → null（刷新、直连、前进后退、点了另一台车都走这条）', () => {
    recordFlipSource(card('car-image-5', rect(0, 0, 400, 300)))
    expect(consumeFlipSource('car-image-12')).toBeNull()
  })

  it('id 不匹配时也会清空 —— 否则过期矩形会留给下一次导航', () => {
    recordFlipSource(card('car-image-5', rect(0, 0, 400, 300)))
    consumeFlipSource('car-image-9')
    // 此时再回到 5，不该还能取到那条几秒前的记录
    expect(consumeFlipSource('car-image-5')).toBeNull()
  })

  it('消费一次就没了，第二次为 null', () => {
    recordFlipSource(card('car-image-5', rect(0, 0, 400, 300)))
    expect(consumeFlipSource('car-image-5')).not.toBeNull()
    expect(consumeFlipSource('car-image-5')).toBeNull()
  })

  it('没记录过 → null', () => {
    expect(consumeFlipSource('car-image-5')).toBeNull()
  })

  it('元素没有 data-flip-id → 不记录', () => {
    recordFlipSource(card(null, rect(0, 0, 400, 300)))
    expect(consumeFlipSource('car-image-5')).toBeNull()
  })

  it('元素面积为 0（当时不可见）→ 不记录', () => {
    recordFlipSource(card('car-image-5', rect(120, 640, 0, 0)))
    expect(consumeFlipSource('car-image-5')).toBeNull()
  })

  it('0 宽但非 0 高也算不可见 —— 只判 width === 0 会漏掉这种', () => {
    recordFlipSource(card('car-image-5', rect(120, 640, 0, 300)))
    expect(consumeFlipSource('car-image-5')).toBeNull()
  })

  it('传 null/undefined 不炸', () => {
    expect(() => recordFlipSource(null)).not.toThrow()
    expect(() => recordFlipSource(undefined)).not.toThrow()
  })

  it('后一次记录覆盖前一次', () => {
    recordFlipSource(card('car-image-5', rect(0, 0, 400, 300)))
    recordFlipSource(card('car-image-12', rect(0, 900, 400, 300)))
    expect(consumeFlipSource('car-image-12')?.rect.top).toBe(900)
    expect(consumeFlipSource('car-image-5')).toBeNull()
  })
})

describe('flipId', () => {
  it('数字与字符串得到同一个 id', () => {
    expect(flipId(5)).toBe('car-image-5')
    expect(flipId('5')).toBe('car-image-5')
  })
})
