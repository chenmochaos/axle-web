import { describe, it, expect } from 'vitest'
import { displayName } from './carName'
import { mockCars } from '@/api/mock'

describe('displayName', () => {
  it('去掉结尾的底盘代号 / 改装厂后缀', () => {
    expect(displayName('Mazda MX-5 (ND)')).toBe('Mazda MX-5')
    expect(displayName('BMW M4 Competition (Vorsteiner)')).toBe('BMW M4 Competition')
  })

  it('认中文括号 —— 实拍数据里两种都出现过', () => {
    expect(displayName('马自达 MX-5（ND）')).toBe('马自达 MX-5')
  })

  it('没有后缀时原样返回', () => {
    expect(displayName('Mercedes-AMG GT 63 S 4MATIC+')).toBe('Mercedes-AMG GT 63 S 4MATIC+')
    expect(displayName('Tesla Model S Plaid')).toBe('Tesla Model S Plaid')
  })

  it('括号在中间不动 —— 那是车款名的一部分', () => {
    // '911 (992) GT3' 的 (992) 若被吃掉就成了 '911 GT3'，是另一台车
    expect(displayName('911 (992) GT3')).toBe('911 (992) GT3')
  })

  it('整个名字就是一对空括号时不剥成空串', () => {
    expect(displayName('（）')).toBe('（）')
    expect(displayName('( )')).toBe('( )')
  })

  it('末尾多余的空白一并清掉', () => {
    expect(displayName('Mazda MX-5 (ND)  ')).toBe('Mazda MX-5')
  })

  it('对 mock 全量车源都不产生空名', () => {
    const blank = mockCars.filter((c) => displayName(c.name).length === 0).map((c) => c.name)
    expect(blank).toEqual([])
  })
})
