import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { USE_MOCK, fetchBrands, fetchCarsByBrand, fetchFeaturedCars, fetchHeroCars, kindOf } from './car'
import { mockCars } from './mock'
import type { VehicleKind } from './types'

/**
 * 这些用例守的不是「函数返回值长什么样」，是三次真踩过的坑：
 *
 * 1. 卡片图指向已删文件 → 静默渲染成空图，不报错（上一轮换素材时全站卡片都白了）
 * 2. `typeId`（品牌 id）当品牌名比 → 按品牌筛永远返回空（`'1' !== '保时捷'`）
 * 3. 大类筛选加进来之后，品牌的 `kinds` 和车源表漂移 → 某个 tab 下品牌凭空消失
 *
 * 都是「不报错、只是不对」的失败，所以值得用断言钉住。
 */

/** '/cars/cut/x.webp' → '<repo>/public/cars/cut/x.webp' */
const onDisk = (url: string) => resolve(process.cwd(), 'public', url.replace(/^\//, ''))

/** 真机路径没有 mock 数据可查，这组用例整体跳过（`VITE_USE_MOCK=false pnpm test` 时） */
describe.runIf(USE_MOCK)('mock 车源与素材', () => {
  it('每台车的 images[0] 都指向真实存在的文件', () => {
    const missing = mockCars
      .filter((c) => !existsSync(onDisk(c.images[0])))
      .map((c) => `${c.name} → ${c.images[0]}`)
    expect(missing).toEqual([])
  })

  it('给了 cutout 的，抠图文件也真实存在', () => {
    const missing = mockCars
      .filter((c) => c.cutout && !existsSync(onDisk(c.cutout)))
      .map((c) => `${c.name} → ${c.cutout}`)
    expect(missing).toEqual([])
  })

  it('kind 缺省视作汽车', () => {
    expect(kindOf({ ...mockCars[0], kind: undefined })).toBe('car')
    expect(kindOf({ ...mockCars[0], kind: 'motorcycle' })).toBe('motorcycle')
  })
})

describe.runIf(USE_MOCK)('首屏选车（编辑口径）', () => {
  it('四台：两辆摩托 + 两辆汽车', async () => {
    const hero = await fetchHeroCars()
    expect(hero).toHaveLength(4)
    expect(hero.filter((c) => kindOf(c) === 'motorcycle')).toHaveLength(2)
    expect(hero.filter((c) => kindOf(c) === 'car')).toHaveLength(2)
  })

  it('四台都带 cutout —— 首屏是白底车台，没有抠图就立不住', async () => {
    const hero = await fetchHeroCars()
    const noCutout = hero.filter((c) => !c.cutout?.includes('/cars/cut/')).map((c) => c.name)
    expect(noCutout).toEqual([])
  })
})

describe.runIf(USE_MOCK)('按大类与品牌筛选', () => {
  it('品牌的 kinds 从车源表现算，且不会出现「点进去是空」的品牌', async () => {
    const brands = await fetchBrands()
    const kindsOf = (name: string) => brands.find((b) => b.name === name)?.kinds ?? []

    expect(kindsOf('宝马')).toContain('car')
    expect(kindsOf('宝马')).toContain('motorcycle')
    expect(kindsOf('春风动力')).toEqual<VehicleKind[]>(['motorcycle'])
    expect(kindsOf('奥迪')).toEqual<VehicleKind[]>(['car'])
    expect(brands.every((b) => (b.kinds?.length ?? 0) > 0)).toBe(true)
  })

  it('不传 kind 时返回全量前 N 条（老行为不变）', async () => {
    expect(await fetchFeaturedCars(6)).toHaveLength(6)
  })

  it('传 kind 时只返回该大类，且能取满（摩托不够 6 台就返回全部 4 台）', async () => {
    const motos = await fetchFeaturedCars(6, 'motorcycle')
    expect(motos).toHaveLength(4)
    expect(motos.every((c) => kindOf(c) === 'motorcycle')).toBe(true)
  })

  it('按品牌 id 查得到车（typeId → 品牌名 的映射没断）', async () => {
    const bmw = (await fetchBrands()).find((b) => b.name === '宝马')
    expect(bmw).toBeDefined()

    const page = await fetchCarsByBrand({ typeId: bmw?.id })
    expect(page.list.length).toBeGreaterThan(0)
    expect(page.list.every((c) => c.brand === '宝马')).toBe(true)
  })

  it('品牌 + 大类可以叠加', async () => {
    const bmw = (await fetchBrands()).find((b) => b.name === '宝马')
    const page = await fetchCarsByBrand({ typeId: bmw?.id, kind: 'motorcycle' })
    expect(page.list.length).toBeGreaterThan(0)
    expect(page.list.every((c) => c.brand === '宝马' && kindOf(c) === 'motorcycle')).toBe(true)
  })
})
