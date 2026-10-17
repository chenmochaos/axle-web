import { describe, it, expect } from 'vitest'
import { formatCount } from './useCountUp'

describe('formatCount', () => {
  it('整数默认不加小数位', () => {
    expect(formatCount(328000)).toBe('328,000')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(999)).toBe('999')
  })

  it('四位数起才插千分位', () => {
    expect(formatCount(1000)).toBe('1,000')
    expect(formatCount(1234567)).toBe('1,234,567')
  })

  it('按 decimals 定点，并保留末尾零', () => {
    expect(formatCount(3.5, 1)).toBe('3.5')
    expect(formatCount(3, 1)).toBe('3.0')
    expect(formatCount(1234567.891, 2)).toBe('1,234,567.89')
  })

  it('负数符号不进千分位分组', () => {
    expect(formatCount(-1234)).toBe('-1,234')
    expect(formatCount(-1234.5, 1)).toBe('-1,234.5')
  })

  it('非有限数回落为 0，不产生 NaN 显示', () => {
    expect(formatCount(NaN)).toBe('0')
    expect(formatCount(Infinity)).toBe('0')
    expect(formatCount(-Infinity)).toBe('0')
  })

  it('补间过程的中间值始终是合法显示值', () => {
    // 模拟 expo.out 采样点，确保没有 1234.5678 这种毛边
    for (const v of [0, 1.234, 99.99, 1234.5678, 328000]) {
      expect(formatCount(v, 1)).toMatch(/^-?\d{1,3}(,\d{3})*(\.\d)?$/)
    }
  })
})
