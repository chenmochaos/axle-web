/**
 * 登录表单的两个输入校验。
 *
 * ── 这个文件的存在理由：**不要写 `^1[3-9]\d{9}$`** ─────────────────────────
 *
 * `^1[3-9]\d{9}$` 是教程里那个想当然的写法，也是我原本要写的。后端的真身是
 * `RegexPatterns.PHONE_REGEX`（`RegexUtils:14` 委托过去）：
 *
 *     ^1([38][0-9]|4[579]|5[0-3,5-9]|6[6]|7[0135678]|9[89])\d{8}$
 *
 * 它比 `[3-9]` **窄得多**，被它拒掉的号段包括：`14x`（除 145/147/149）、`154`、
 * `160-165`、`167-169`、`172`、`174`、`179`、`19x`（除 198/199）…… 用宽松版校验的
 * 后果不是「多放进来几个」，而是**两边给出相反的结论**：前端说「手机号没问题」，
 * 用户点了获取验证码，后端回一句 `手机号格式错误`。这种矛盾的提示比直接拒绝难查得多。
 *
 * 所以这里**逐字照抄**后端的正则，并由 `phone.spec.ts` 直接读 Java 源码来守 ——
 * 抄错、或后端哪天改了号段，测试立刻红。
 *
 * ── 顺带记一笔：JS 的 `$` 与 Java 的 `matches()` 在这里**不**分岔 ──────────
 *
 * 我原本以为这里有个坑，写了个 `/\s/` 排除来「补掉 JS `$` 允许末尾换行的差异」。
 * 那是把 JS 和 **Python** 记混了：Python 的 `$` 匹配末尾换行之前，JS 的 `$`（无 `m`
 * 标志）是**严格的输入末尾**锚点，与 Java `matches()` 的语义一致。
 *
 * 这个错误是 `phone.spec.ts` 里那条断言当场抓出来的（`new RegExp(PHONE_PATTERN)
 * .test('13800000000\n')` 期望 true、实际 false）。所以那层排除已经删掉 —— 多余的
 * 代码配一段错解释，比不写还坏。
 */

/** 后端 `RegexPatterns.PHONE_REGEX` 的逐字副本。改动前先看上面那段说明 */
export const PHONE_PATTERN = '^1([38][0-9]|4[579]|5[0-3,5-9]|6[6]|7[0135678]|9[89])\\d{8}$'

const PHONE_RE = new RegExp(PHONE_PATTERN)

/**
 * 手机号是否合法。**与后端 `RegexUtils.isPhoneInvalid` 的取反严格等价。**
 *
 * 镜像了后端 `RegexUtils.mismatch` 的两层判据：
 * 1. `StrUtil.isBlank` → 空串/纯空白视为非法
 * 2. `str.matches(regex)` → 整串匹配（这条正则自带 `^…$`，JS 的 `$` 同样严格）
 *
 * 等价性不是靠眼看，是靠 `phone.spec.ts` 在几百个输入上跟 Java 语义逐个比对。
 */
export function isValidPhone(phone: unknown): boolean {
  // 后端 `StrUtil.isBlank`：null / 空串 / 纯空白都算「没填」。
  // 注意这里**不 trim 后再交给正则** —— 后端拿原串去 matches()，带空格的就是非法。
  if (typeof phone !== 'string' || phone.trim() === '') return false
  return PHONE_RE.test(phone)
}

/**
 * 验证码是否填够 6 位。
 *
 * ⚠️ **这是前端自己的交互规则，不是后端规则的镜像。** 后端确实定义了
 * `VERIFY_CODE_REGEX = ^[a-zA-Z\d]{6}$`，但 `RegexUtils.isCodeInvalid` **全仓库无人调用**
 * （2026-10-16 grep 确认）—— 真机登录只做一件事：拿 Redis 里那份跟用户填的比字符串。
 * 也就是说格式再离谱，只要凑巧相等就放行（生成的码是 `RandomUtil.randomNumbers(6)`，
 * 所以实际就是 6 位数字）。
 *
 * 写这条是为了在用户少按一位时**立刻**给反馈，省一次必然失败的请求。所以它只查
 * 「6 位数字」，不引入后端没有的字符集要求 —— 前端比后端严会拒掉合法输入。
 */
export function isValidSmsCode(code: unknown): boolean {
  return typeof code === 'string' && /^\d{6}$/.test(code)
}
