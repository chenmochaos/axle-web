import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  HERO_ELIGIBLE_IDS,
  reviewFromDTO,
  cutoutPathOf,
  heroCutoutOf,
  carFromDTO,
  brandFromDTO,
} from './adapt'
import { mockCars, mockBrands } from './mock'
import type { ReviewDTO, CarDTO, BrandDTO } from './types'

/**
 * 这些用例守的是适配层的三类静默失败 —— 三种都「不报错、只是不对」：
 *
 * 1. **单位/形状漏换算**。`images` 忘了 `split` 的表现是详情页白屏（`CarHero` 对字符串
 *    调 `.filter` 直接抛 TypeError），而 `avgPrice` 忘了除 100 的表现是「宝马 M4 卖
 *    9880000 元」—— 页面正常渲染，只是数字荒谬。后者更危险，因为它不会有人去查。
 * 2. **`cutout` 白名单与 mock 漂移**。白名单写在这里、`cutout` 写在 `mock.ts`，
 *    两处各改一处就会「首屏某台车突然变成带背景的原图」，肉眼很难归因。
 * 3. **缺字段被伪造**。纯电车没有 `displacement`，给它填个 `'-'` 会让详情页多出一行
 *    假规格。缺就是缺。
 */

/** '/cars/cut/x.webp' → '<repo>/public/cars/cut/x.webp' */
const onDisk = (url: string) => resolve(process.cwd(), 'public', url.replace(/^\//, ''))

/** 最小合法 `CarDTO`，用例只覆写自己关心的字段 */
function dto(over: Partial<CarDTO> = {}): CarDTO {
  return {
    id: 1,
    name: '测试车',
    typeId: 1,
    images: '/cars/a.jpg',
    address: '上海市黄浦区人民大道 200 号',
    x: 120.1,
    y: 30.2,
    avgPrice: 1000000,
    sold: 1,
    comments: 2,
    score: 47,
    ...over,
  }
}

describe('carFromDTO —— 三处结构性换算', () => {
  it('images 逗号串 → 数组，并丢掉空段与多余空白', () => {
    expect(carFromDTO(dto({ images: '/a.jpg,/b.jpg' })).images).toEqual(['/a.jpg', '/b.jpg'])
    // 只有一个值（后端最常见的形状）
    expect(carFromDTO(dto({ images: '/a.jpg' })).images).toEqual(['/a.jpg'])
    // 尾随逗号 / 连续逗号 / 逗号后带空格 —— 都产出 `['', ...]` 这种空串，必须滤掉
    expect(carFromDTO(dto({ images: '/a.jpg, ,/b.jpg,' })).images).toEqual(['/a.jpg', '/b.jpg'])
    // 真有空串这一列（后端 `images` 可空）
    expect(carFromDTO(dto({ images: '' })).images).toEqual([])
  })

  it('avgPrice / originalPrice 分 → 元，四舍五入到整数', () => {
    expect(carFromDTO(dto({ avgPrice: 9880000 })).price).toBe(98800)
    // 不会出现角分：后端给奇数分也要落到整数元
    expect(carFromDTO(dto({ avgPrice: 12345 })).price).toBe(123)
    expect(carFromDTO(dto({ avgPrice: 9880000, originalPrice: 12980000 })).originalPrice).toBe(129800)
  })

  it('score 是 ×10 的整数 → 还原成 0–5 的小数', () => {
    expect(carFromDTO(dto({ score: 47 })).score).toBe(4.7)
    expect(carFromDTO(dto({ score: 50 })).score).toBe(5)
  })

  it('distance 是**米**（GEO 查询）→ 公里，保留一位小数', () => {
    // 首页卡片与详情页都写死 `{{ car.distance }} km`，不换算会渲染出「674.1382 km」
    expect(carFromDTO(dto({ distance: 674.1382 })).distance).toBe(0.7)
    expect(carFromDTO(dto({ distance: 4482.8281 })).distance).toBe(4.5)
    expect(carFromDTO(dto({ distance: 1000 })).distance).toBe(1)
  })

  it('没传坐标时后端不返回 distance —— 不补 0（0 km 是「就在楼下」的意思）', () => {
    expect(carFromDTO(dto()).distance).toBeUndefined()
    expect(carFromDTO(dto({ distance: null })).distance).toBeUndefined()
  })
})

describe('carFromDTO —— kind 与缺字段', () => {
  it('kind 只认字面量 motorcycle，其余（含 null）都视作汽车', () => {
    expect(carFromDTO(dto({ kind: 'motorcycle' })).kind).toBe('motorcycle')
    expect(carFromDTO(dto({ kind: 'car' })).kind).toBe('car')
    // 历史数据是 null（`usedcar.sql` 之前灌的餐饮行就没这一列）
    expect(carFromDTO(dto({ kind: null })).kind).toBe('car')
    expect(carFromDTO(dto()).kind).toBe('car')
  })

  it('后端没给的字段一律 undefined，不伪造占位值', () => {
    const c = carFromDTO(dto())
    expect(c.mileage).toBeUndefined()
    expect(c.registerDate).toBeUndefined()
    expect(c.gearbox).toBeUndefined()
    expect(c.fuel).toBeUndefined()
    expect(c.displacement).toBeUndefined()
    expect(c.ownerCount).toBeUndefined()
    expect(c.originalPrice).toBeUndefined()
    expect(c.cutout).toBeUndefined()
  })

  it('后端给了 null 的字段也落到 undefined —— 两种「没有」不该在类型上分叉', () => {
    const c = carFromDTO(dto({ displacement: null, ownerCount: null, originalPrice: null }))
    expect(c.displacement).toBeUndefined()
    expect(c.ownerCount).toBeUndefined()
    expect(c.originalPrice).toBeUndefined()
  })

  it('ownerCount = 0 是一手车，不能被当成缺失丢掉', () => {
    // 0 是有效值。若用 `?? undefined` 之外的写法（如 `|| undefined`）会被吞掉，
    // 表现是「一手车」那行消失 —— 而一手车恰恰是最该写出来的一行。
    expect(carFromDTO(dto({ ownerCount: 0 })).ownerCount).toBe(0)
  })

  it('品牌名由调用方带入，缺省是空串而不是编一个', () => {
    expect(carFromDTO(dto(), '宝马').brand).toBe('宝马')
    expect(carFromDTO(dto()).brand).toBe('')
  })
})

describe('cutout —— 白名单 + 命名约定', () => {
  it('源图路径 → 抠图路径', () => {
    expect(cutoutPathOf('/cars/bmw-m4-vorsteiner.jpg')).toBe('/cars/cut/bmw-m4-vorsteiner.webp')
    // 源图后缀不统一（jpg / jpeg / png），统一产出 .webp
    expect(cutoutPathOf('/cars/mazda-mx5.jpeg')).toBe('/cars/cut/mazda-mx5.webp')
    expect(cutoutPathOf('/cars/a.b.c.png')).toBe('/cars/cut/a.b.c.webp')
    // 文件名里带括号（`mx5(1).jpeg`）也不受影响
    expect(cutoutPathOf('/cars/mx5(1).jpeg')).toBe('/cars/cut/mx5(1).webp')
    expect(cutoutPathOf('')).toBeUndefined()
  })

  it('白名单外的车**不给** cutout，哪怕抠图文件客观存在', () => {
    // 这条是这张白名单存在的全部理由：`public/cars/cut/` 下有 22 个产物，
    // 但只有 7 个干净到能上首屏。按「文件存在」推导会让脏图堂而皇之地上首屏。
    expect(heroCutoutOf(1, ['/cars/manhart-mh4-gtr-ii.jpg'])).toBeUndefined()
    expect(heroCutoutOf(999, ['/cars/whatever.jpg'])).toBeUndefined()
  })

  it('白名单内的车按 images[0] 推导，且取的是主图不是图集里任意一张', () => {
    // 车 10 有两张图，抠图只对应主图 mx5(1).jpeg 那张原图并不该被用来推导
    expect(heroCutoutOf(10, ['/cars/mazda-mx5.jpeg', '/cars/mx5(1).jpeg'])).toBe(
      '/cars/cut/mazda-mx5.webp',
    )
  })

  it('没有图就推不出抠图（不能让 `/cars/cut/.webp` 这种空名产物漏出去）', () => {
    expect(heroCutoutOf(5, [])).toBeUndefined()
    expect(heroCutoutOf(5, [''])).toBeUndefined()
  })
})

/**
 * 上面那组用例验的是适配层自身。这一组拿 **mock 的既有数据**给白名单对账 ——
 * 白名单在 `adapt.ts`、`cutout` 在 `mock.ts`，两处是各自手写的，
 * 只在其中一处加车就会出现「首屏某台车悄悄退回带背景的原图」。
 */
describe('白名单与 mock 对账（漂移守卫）', () => {
  it('mock 里**有**cutout 的车，恰好就是白名单里那几台', () => {
    const declared = mockCars.filter((c) => c.cutout).map((c) => c.id).sort((a, b) => a - b)
    expect(declared).toEqual([...HERO_ELIGIBLE_IDS].sort((a, b) => a - b))
  })

  it('每台的 cutout 都等于按 images[0] 推出来的路径 —— mock 与真机走同一条约定', () => {
    // 真机路径下 `cutout` 就是这么算出来的，如果 mock 手写的值与推导结果不一致，
    // 两条数据源渲染出的首屏就不是同一批图，而验收判据正是「同一页、两种数据源」。
    const mismatched = mockCars
      .filter((c) => c.cutout)
      .map((c) => ({ name: c.name, declared: c.cutout, derived: heroCutoutOf(c.id, c.images) }))
      .filter((r) => r.declared !== r.derived)
    expect(mismatched).toEqual([])
  })

  it('推出来的抠图文件**真实存在**（命名约定对不上会静默渲染成空图）', () => {
    const missing = mockCars
      .filter((c) => c.cutout)
      .map((c) => heroCutoutOf(c.id, c.images)!)
      .filter((p) => !existsSync(onDisk(p)))
    expect(missing).toEqual([])
  })

  it('白名单里没有指向不存在的车的死条目', () => {
    const ids = new Set(mockCars.map((c) => c.id))
    expect([...HERO_ELIGIBLE_IDS].filter((id) => !ids.has(id))).toEqual([])
  })
})

describe('brandFromDTO', () => {
  const brandDTO = (over: Partial<BrandDTO> = {}): BrandDTO => ({
    id: 1,
    name: '宝马',
    mark: 'BMW',
    ...over,
  })

  it('中文名与拉丁字标各归各位', () => {
    expect(brandFromDTO(brandDTO())).toEqual({ id: 1, name: '宝马', mark: 'BMW' })
  })

  it('mark 缺失/空白时给空串，**不**用中文名兜底', () => {
    // 字标走 `--font-display`（Oswald），没有 CJK 字形。用中文名兜底会掉回另一种字体，
    // 一行里两种字体比一行里空一层更难看（CLAUDE.md §1.2）。
    expect(brandFromDTO(brandDTO({ mark: null })).mark).toBe('')
    expect(brandFromDTO(brandDTO({ mark: undefined })).mark).toBe('')
    expect(brandFromDTO(brandDTO({ mark: '   ' })).mark).toBe('')
  })

  it('mark 两侧空白被裁掉（后端是自由文本列，灌数据时容易带空格）', () => {
    expect(brandFromDTO(brandDTO({ mark: ' BMW ' })).mark).toBe('BMW')
  })

  it('不臆造后端没有的 count', () => {
    expect(brandFromDTO(brandDTO()).count).toBeUndefined()
  })

  it('mock 的每个品牌都能过一遍适配（真机路径下品牌表走的就是这个函数）', () => {
    const brands = mockBrands.map((b) => brandFromDTO({ id: b.id, name: b.name, mark: b.mark }))
    expect(brands.every((b) => b.name && b.mark)).toBe(true)
  })
})

/** 最小合法 `ReviewDTO`（后端 `entity/Review.java`）。真机 `/review/hot` 的实测形状 */
function reviewDTO(over: Partial<ReviewDTO> = {}): ReviewDTO {
  return {
    id: 4,
    carId: 4,
    userId: 2,
    name: '可可今天不吃肉',
    icon: '/imgs/icons/kkjtbcr.jpg',
    title: '无尽浪漫的夜晚',
    images: '/imgs/blogs/a.jpg,/imgs/blogs/b.jpg',
    content: '生活就是一半烟火',
    liked: 12,
    comments: 3,
    createTime: '2026-10-12T14:20:00',
    ...over,
  }
}

/**
 * 这个 suite 是一个**已经发生过的故障**的回归判据，不是假想的边界。
 *
 * 真机 `/review/hot` 原先不过适配层，平铺的作者字段被当成 `author` 对象用，
 * `ReviewFeed` 读 `undefined.nickName` 抛 TypeError —— 首页那一整块 section
 * 直接消失，控制台只有一条不显眼的错误，页面上完全看不出是「坏了」。
 *
 * 所以下面每一条都对应那个故障的一个必要条件，尤其是第一条：它就是这个 bug 本身。
 */
describe('reviewFromDTO —— 平铺 → 嵌套、逗号串 → 数组', () => {
  it('平铺的 userId/name/icon 组装成 author 对象（**这就是之前炸掉的那一处**）', () => {
    const r = reviewFromDTO(reviewDTO())
    expect(r.author).toEqual({ id: 2, nickName: '可可今天不吃肉', icon: '/imgs/icons/kkjtbcr.jpg' })
    // 直接读一次，锁住组件里那句 `lead.author.nickName` 的访问路径
    expect(() => r.author.nickName).not.toThrow()
  })

  it('images 逗号串 → 数组，空段与多余空白同样滤掉', () => {
    expect(reviewFromDTO(reviewDTO({ images: '/a.jpg,/b.jpg' })).images).toEqual(['/a.jpg', '/b.jpg'])
    expect(reviewFromDTO(reviewDTO({ images: '/a.jpg, ,/b.jpg,' })).images).toEqual(['/a.jpg', '/b.jpg'])
  })

  it('images 为空/null/空串时给空数组 —— `images[0]` 不能是 undefined', () => {
    // `Review.images` 是 `string[]`（非可选），`ReviewFeed` 的 `<img :src="lead.images[0]">`
    // 直接下标取值，不做防御。这里漏了就是又一个「读 undefined 的属性」
    expect(reviewFromDTO(reviewDTO({ images: null })).images).toEqual([])
    expect(reviewFromDTO(reviewDTO({ images: '' })).images).toEqual([])
    expect(reviewFromDTO(reviewDTO({ images: undefined })).images).toEqual([])
  })

  it('作者昵称/头像缺失时给空串，**不**编一个「匿名用户」', () => {
    const r = reviewFromDTO(reviewDTO({ name: null, icon: undefined }))
    expect(r.author.nickName).toBe('')
    expect(r.author.icon).toBe('')
  })

  it('liked / comments / content / createTime 缺失不落 undefined（模板里直接插值）', () => {
    const r = reviewFromDTO(reviewDTO({ liked: null, comments: undefined, content: null }))
    expect(r.liked).toBe(0)
    expect(r.comments).toBe(0)
    expect(r.content).toBe('')
  })

  it('liked = 0 是「没人点赞」，不能被当成缺失', () => {
    expect(reviewFromDTO(reviewDTO({ liked: 0 })).liked).toBe(0)
  })

  it('content 里的换行标签变成空格，**不会**在页面上显示成字面 `<br/>`', () => {
    // 真机 tb_blog.content 是 HTML 片段（实测 4 行共 40 个 `<br/>` + 29 个 `<br>`，无别的标签），
    // 而 mock 全是纯文本 —— `Review.content` 的语义由 mock 定义，所以这里必须归一化。
    // 不处理的表现是用户看见「一半烟火<br/>一半诗意」，截图里非常显眼。
    const r = reviewFromDTO(reviewDTO({ content: '一半烟火<br/>一半诗意' }))
    expect(r.content).toBe('一半烟火 一半诗意')
    expect(r.content).not.toContain('<br')
  })

  it('三种 `<br>` 写法都吃掉：`<br/>` / `<br>` / `<br />`，大小写不敏感', () => {
    expect(reviewFromDTO(reviewDTO({ content: 'a<br/>b' })).content).toBe('a b')
    expect(reviewFromDTO(reviewDTO({ content: 'a<br>b' })).content).toBe('a b')
    expect(reviewFromDTO(reviewDTO({ content: 'a<br />b' })).content).toBe('a b')
    expect(reviewFromDTO(reviewDTO({ content: 'a<BR/>b' })).content).toBe('a b')
    // 连续换行（真机数据里很常见）压成空格，不留一串空白
    expect(reviewFromDTO(reviewDTO({ content: 'a<br/><br/>b' })).content).toBe('a  b')
  })

  it('**不是 sanitizer**：`<br>` 以外的标签原样留着', () => {
    // 边界要写死：今天的数据只有 `<br>`，但别让下一个读到这个函数的人以为它可以当清洗器用。
    // 真要渲染富文本，M4 该去用原始的 ReviewDTO，而不是把这个函数扩成清洗器。
    const html = '<b>加粗</b>与<a href="#">链接</a>'
    expect(reviewFromDTO(reviewDTO({ content: html })).content).toBe(html)
  })

  it('id / title / createTime 一一对应，不串字段', () => {
    const r = reviewFromDTO(reviewDTO({ id: 7, title: 'T', createTime: '2026-01-02T03:04:05' }))
    expect(r.id).toBe(7)
    expect(r.title).toBe('T')
    expect(r.createTime).toBe('2026-01-02T03:04:05')
  })
})
