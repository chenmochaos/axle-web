import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PHONE_PATTERN, isValidPhone, isValidSmsCode } from './phone'

/**
 * 手机号校验的用例。
 *
 * 这里**不手抄期望值**——手抄的期望值只能证明「我写的正则和我脑子里的正则一样」。
 * 真正要证的是「`isValidPhone` 与后端 `RegexUtils.isPhoneInvalid` 对同一个输入
 * 永远给同一个结论」。所以：
 *
 *   * 期望值从 Java 源码里**读出来**（`RegexPatterns.PHONE_REGEX`），
 *   * 判据用**忠实模拟 Java `matches()`** 的方式实现（见 `javaMatches`），
 *   * 在几百个输入上逐个比对两者。
 *
 * 这样无论是「抄错了正则」还是「JS 的 `$` 与 Java 的 `matches()` 语义不同」，
 * 都会当场露出来。
 */

/**
 * Java `str.matches(re)` 的忠实模拟：**整串**必须匹配。
 *
 * 关键在 `m[0] === s` —— JS 的 `$` 允许匹配停在末尾换行之前，所以
 * `"13800000000\n"` 用 `test()` 是 true，但 Java 会拒。用「匹配到的子串必须等于
 * 整个输入」来判定，才是 `Matcher.matches()` 的本义。
 */
function javaMatches(pattern: string, s: string): boolean {
  if (s.trim() === '') return false // StrUtil.isBlank
  const m = s.match(new RegExp(pattern))
  return m !== null && m.index === 0 && m[0] === s
}

// 前端与后端现在是同一个仓库的兄弟目录，文件**不可能缺失**。
// 早先这里用 `skipIf` 兜底，已删掉：缺失应当让测试红掉，而不是安静地少跑一组断言。
const PATTERNS_JAVA = resolve(
  process.cwd(),
  '../server/src/main/java/com/axle/utils/RegexPatterns.java',
)

/**
 * 从 Java 源码里取出 `PHONE_REGEX` 的**运行时**值。
 *
 * 注意最后那个 `.replace(/\\\\/g, '\\')`：Java 源码里写的是 `"\\d{8}"`，那是 Java 的
 * 字符串转义，**运行时**的值是 `\d{8}`。少这一步，构造出的 RegExp 就会去找一个
 * 「反斜杠后面跟个 d」的字面量，于是所有合法手机号都被判非法 —— 这个 bug 在
 * 第一次跑就靠下面的等价性用例抓出来了（字符串相等那条也会红，但信息量小得多）。
 */
const backendPattern = /PHONE_REGEX\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(
  readFileSync(PATTERNS_JAVA, 'utf8'),
)?.[1]?.replace(/\\\\/g, '\\')

describe('isValidPhone —— 基本判据', () => {
  it.each([
    ['13800000000', true],
    ['13300000000', true],
    ['18900000000', true],
    ['16600000000', true],
    ['17000000000', true],
    ['19800000000', true],
    ['19900000000', true],
  ])('接受 %s', (phone, expected) => {
    expect(isValidPhone(phone)).toBe(expected)
  })

  /**
   * 这一组是本文件最该存在的地方 —— 全是 `^1[3-9]\d{9}$` 会**放行**、
   * 而后端会**拒绝**的号段。抄了宽松版正则的话，这几条会全红。
   */
  it.each([
    '15400000000', // 5[0-3,5-9] 不含 4
    '16000000000', // 6 只收 66
    '17200000000', // 7[0135678] 不含 2
    '17400000000',
    '17900000000',
    '19000000000', // 9 只收 98/99
    '14000000000', // 4 只收 45/47/49
    '14600000000',
    '14800000000',
  ])('拒绝 %s（宽松正则 会放行它）', (phone) => {
    expect(isValidPhone(phone)).toBe(false)
  })

  it.each([
    ['', false],
    ['   ', false],
    ['1380000000', false], // 10 位
    ['138000000001', false], // 12 位
    ['23800000000', false], // 不以 1 开头
    ['1380000000a', false],
    ['+8613800000000', false], // 带国际区号，后端不收
    ['138 0000 0000', false], // 含空格
    ['１３８００００００００', false], // 全角数字
  ])('拒绝 %s', (phone, expected) => {
    expect(isValidPhone(phone)).toBe(expected)
  })

  it('非字符串输入不炸（表单初值是 undefined）', () => {
    for (const v of [undefined, null, 13800000000, {}, []]) {
      expect(isValidPhone(v)).toBe(false)
    }
  })

  it('末尾换行被拒 —— 顺带把「JS `$` 到底严不严」这件事钉死', () => {
    // 我一度以为 JS 的 `$` 会放过末尾换行（那是 **Python** 的语义），并据此写了
    // 一层 `/\\s/` 排除。这条断言当场证伪：JS 的 `$`（无 `m`）是严格的输入末尾锚点，
    // 裸正则本来就拒，跟 Java `matches()` 一致 —— 所以那层排除是多余的，已删。
    expect(new RegExp(PHONE_PATTERN).test('13800000000\n')).toBe(false)
    expect(javaMatches(PHONE_PATTERN, '13800000000\n')).toBe(false)
    expect(isValidPhone('13800000000\n')).toBe(false)
  })
})

/* ── 与后端源码的对齐 ──────────────────────────────────────────────────── */

describe('与后端正则对齐', () => {
  it('PHONE_PATTERN 与 RegexPatterns.java 里的字面量逐字相同', () => {
    expect(PHONE_PATTERN).toBe(backendPattern)
  })

  it('JAVA 正则里没有 JS 不支持或语义不同的语法', () => {
    // 后端这条用了 `\d`、字符类、分组 —— 都是两边共有的。
    // 若哪天后端换成 `\p{...}` 或占有量词，这条会提醒手动核对。
    expect(PHONE_PATTERN).not.toMatch(/\\p\{|\\P\{|\+\+|(?<!\\)\*/)
  })

  it('在几百个输入上，isValidPhone 与 Java matches() 结论完全一致', () => {
    const corpus: string[] = []

    // 穷举第二位+第三位（00-99），后面补 8 个 0 —— 覆盖正则里每个分支
    for (let a = 0; a <= 9; a++) {
      for (let b = 0; b <= 9; b++) {
        corpus.push(`1${a}${b}00000000`)
      }
    }
    // 真实号段样例
    corpus.push(
      '13800000000', '18612345678', '14500000000', '14700000000', '14900000000',
      '15000000000', '15300000000', '15500000000', '15900000000', '16600000000',
      '17000000000', '17800000000', '19800000000', '19900000000',
    )
    // 各种畸形输入
    corpus.push(
      '', ' ', '\n', '13800000000\n', '\n13800000000', ' 13800000000',
      '13800000000 ', '1380000000', '138000000001', '23800000000',
      '13800000000a', 'a3800000000', '138,0000000', '15,12345678',
    )

    const disagreements = corpus.filter(
      (s) => isValidPhone(s) !== javaMatches(backendPattern!, s),
    )
    expect(disagreements, `与后端结论不一致的输入：${disagreements.join(' / ')}`).toEqual([])
  })

  it('后端正则里那个逗号是它的历史包袱，我们照抄而不是「顺手修掉」', () => {
    // `5[0-3,5-9]` 里的逗号是字面量字符，不是分隔符 —— 所以 "15,12345678" 在后端
    // 是**合法**的。显得荒谬，但前端若擅自收紧就会造成两边结论相反；
    // 正确做法是照抄 + 在这里写明，把荒谬摆到台面上。
    expect(PHONE_PATTERN).toContain('5[0-3,5-9]')
    expect(isValidPhone('15,12345678')).toBe(true)
    expect(javaMatches(backendPattern!, '15,12345678')).toBe(true)
  })
})

describe('isValidSmsCode —— 前端自己的交互规则', () => {
  it.each([
    ['123456', true],
    ['000000', true],
    ['12345', false],
    ['1234567', false],
    ['12a456', false],
    ['', false],
    [' 123456', false],
  ])('%s → %s', (code, expected) => {
    expect(isValidSmsCode(code)).toBe(expected)
  })

  it('非字符串不炸', () => {
    for (const v of [undefined, null, 123456]) {
      expect(isValidSmsCode(v)).toBe(false)
    }
  })
})
