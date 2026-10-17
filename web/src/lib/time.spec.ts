import { describe, it, expect } from 'vitest'
import { formatRemaining, monthDay, remainingUntil } from './time'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('monthDay', () => {
  it('取 MM/DD', () => {
    expect(monthDay('2026-10-20T00:00:00')).toBe('10/20')
  })

  it('个位数月份也补零（切字符串，不做数字运算）', () => {
    expect(monthDay('2026-01-05T23:59:59')).toBe('01/05')
  })

  it('空值给空串，渲染方据此整行不显示', () => {
    expect(monthDay(null)).toBe('')
    expect(monthDay(undefined)).toBe('')
    expect(monthDay('')).toBe('')
  })
})

describe('remainingUntil', () => {
  it('算出与给定时钟的差值', () => {
    const now = Date.parse('2026-10-20T00:00:00')
    expect(remainingUntil('2026-10-20T01:00:00', now)).toBe(HOUR)
  })

  it('已过期给负数（而不是 0）—— 「早了」和「晚了」是不同的状态', () => {
    const now = Date.parse('2026-10-20T02:00:00')
    expect(remainingUntil('2026-10-20T01:00:00', now)).toBe(-HOUR)
  })

  it('空值 / 解析不了都给 0', () => {
    expect(remainingUntil(null)).toBe(0)
    expect(remainingUntil('不是时间')).toBe(0)
  })

  it('后端那种不带时区的 naive 串按本地时区解释（与 LocalDateTime 同义）', () => {
    const iso = '2026-10-20T12:00:00'
    const asLocal = new Date(2026, 9, 20, 12, 0, 0).getTime()
    expect(Date.parse(iso)).toBe(asLocal)
    expect(remainingUntil(iso, asLocal)).toBe(0)
  })
})

describe('formatRemaining', () => {
  it.each([
    [DAY + 2 * HOUR + 3 * MINUTE + 4 * SECOND, '1 天 02:03:04'],
    [2 * DAY, '2 天 00:00:00'],
    [HOUR + MINUTE + SECOND, '01:01:01'],
    [59 * SECOND, '00:00:59'],
    [1, '00:00:00'], // 不足 1 秒：显示 0 秒，但**不说结束**
    [0, '已结束'],
    [-1, '已结束'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatRemaining(ms)).toBe(expected)
  })

  it('1 天 23:59:59 不向上进位成「2 天」', () => {
    // 注意边界是 2 天减 1 秒。`DAY - SECOND`（= 23:59:59）**不足**一天，
    // 按设计不该带「天」前缀 —— 那正是下面这条的另一半。
    expect(formatRemaining(2 * DAY - SECOND)).toBe('1 天 23:59:59')
    expect(formatRemaining(DAY - SECOND)).toBe('23:59:59')
  })

  it('刚好一天整显示 1 天 00:00:00', () => {
    expect(formatRemaining(DAY)).toBe('1 天 00:00:00')
  })

  it('NaN / Infinity 当已结束处理，不吐出 "NaN:NaN:NaN"', () => {
    expect(formatRemaining(Number.NaN)).toBe('已结束')
    expect(formatRemaining(Number.POSITIVE_INFINITY)).toBe('已结束')
  })
})
