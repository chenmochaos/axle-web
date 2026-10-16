/**
 * 车款名的展示口径。**只此一份** —— 首屏与详情页各写一遍必然漂移，
 * 而漂移的表现很隐蔽：同一台车在两页显示成两个名字，看起来像是数据错了。
 *
 * 规则：去掉结尾的括号后缀。
 *
 * ```
 * 'Mazda MX-5 (ND)'                    → 'Mazda MX-5'
 * 'BMW M4 Competition (Vorsteiner)'    → 'BMW M4 Competition'
 * 'Mercedes-AMG GT 63 S 4MATIC+'       → 'Mercedes-AMG GT 63 S 4MATIC+'
 * ```
 *
 * 为什么去掉：括号里是底盘代号（ND）或改装厂（Vorsteiner），是**注解**不是车款名。
 * 展示体字号下它会把主名挤小、把一行读成两行。信息没丢 —— 全名在详情页的参数表里。
 *
 * 只匹配**结尾**且**非空**的括号组：`'911 (992) GT3'` 里的 `(992)` 是名字的一部分，
 * 不该被吃掉。中英文括号都认，实拍数据里两种都出现过。
 */
const TRAILING_PARENTHETICAL = /\s*[（(][^)）]+[)）]\s*$/

export function displayName(name: string): string {
  const stripped = name.replace(TRAILING_PARENTHETICAL, '').trim()
  // 整个名字就是一对括号（'（未知）'）时不要剥成空串 —— 宁可显示原文
  return stripped || name
}
