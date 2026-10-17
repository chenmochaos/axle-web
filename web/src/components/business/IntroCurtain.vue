<script setup lang="ts">
/**
 * 开场幕布：纯白全屏 → 字标逐字浮现 → 整块**淡出**，首屏从底下交叉溶解进来。
 *
 * ── 为什么是白幕而不是黑幕（2026-10-16 改）────────────────────────
 *
 * 全站是纯白底。一块全屏黑幕在白站上读起来像加载失败的故障态，不像设计过的开场；
 * 而且黑→白的跳变本身就很吵。改成白幕后，幕布与页面同色，「揭幕」自然从
 * 「把一块板子抽走」变成「溶解」—— 这也是要的效果。
 *
 * 代价是幕布本身看不见了（白盖白），能让观众读到的只有**字标**与**首屏的浮现**。
 * 所以字标必须留够时间，交接点必须压到淡出中段，让两件事在时间上叠起来。
 *
 * ── 只在满足条件时挂载 ──────────────────────────────────────────
 *
 * **判断不在这里** —— 条件写在 `index.html` 的内联脚本里，`lib/intro.ts` 导出
 * `introWillPlay` 供 `App.vue` 使用。重复判断条件只会让两处慢慢跑偏，这里只负责播。
 *
 * 时序（秒，改这里要同步 ../docs/specs §6.4 的表）：
 *
 * | t | 动作 |
 * |---|---|
 * | 0.20 | 字标逐字浮现：opacity 0→1 且 y 26→0（0.9s，expo.out，stagger 0.06） |
 * | 1.28 | 字标就位，停一拍让观众读到 |
 * | 1.50 | 幕布整体 `opacity → 0`（1.1s，power2.inOut），字标同时继续上浮并淡出 |
 * | 1.72 | **交接点**：放行首屏时间线 |
 * | ~2.60 | 幕布淡尽，`lenis.start()`，卸载自己 |
 *
 * ── 交接点为什么压在淡出前段（0.2）而不是中后段 ────────────────────
 *
 * 幕布白、页面也白，淡出的前段**什么都看不见**：字标化掉之后、首屏起手之前会留一段
 * 空白，读起来像「加载完了但页面是空的」。把交接点提到 0.2，首屏就在幕布还有约八成
 * 不透明度的时候开始淡入 —— 白幕当一层纱，两边同时变，这才叫交叉溶解。
 * 太早（幕布还实着）首屏等于白演一遍；太晚（=100%）中间必然空一拍。
 * ⚠️ **幕布淡出不能用 `visibility` / `display` 收尾**：那样最后一帧会硬切。这里靠
 * `opacity` 走到 0，然后由 `App.vue` 卸载组件（`@done`），中间不留跳变。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap, SplitText } from '@/lib/gsap'
import { lenis } from '@/lib/lenis'
import { clearBootPaint, finishIntro } from '@/lib/intro'

const emit = defineEmits<{ done: [] }>()

const root = ref<HTMLElement | null>(null)
const word = ref<HTMLElement | null>(null)

const WORD_IN = 0.2
const CURTAIN = 1.5
const CURTAIN_DUR = 1.1
/** 交接点占幕布淡出时长的比例。压在**前段**，见上面 docblock 的说明 */
const HANDOFF = 0.2

let tl: gsap.core.Timeline | null = null
let split: SplitText | null = null

onMounted(() => {
  // 幕布自己的底色已经画上去了，撤掉 <html> 上的兜底（否则滚到底会露色边）
  clearBootPaint()
  // 幕布期间锁滚动：幕布后面露出半截已经滚到中间的页面会很出戏
  lenis.stop()

  split = SplitText.create(word.value, { type: 'chars' })

  tl = gsap.timeline({
    onComplete: () => {
      lenis.start()
      emit('done')
    },
  })

  tl.from(split.chars, { opacity: 0, y: 26, duration: 0.9, ease: 'expo.out', stagger: 0.06 }, WORD_IN)
    .to(root.value, { opacity: 0, duration: CURTAIN_DUR, ease: 'power2.inOut' }, CURTAIN)
    // 字标比幕布稍微多走一点：幕布淡成半透明之后它的残影最明显，
    // 让它同时继续上浮就不会「原地消失」
    .to(split.chars, { y: -20, opacity: 0, duration: 0.7, ease: 'power1.in' }, CURTAIN)
    .add(finishIntro, CURTAIN + CURTAIN_DUR * HANDOFF)
})

onUnmounted(() => {
  tl?.kill()
  split?.revert()
  // 万一时序被打断（快速刷新、标签页切走）也要把滚动解开，不能锁死在幕布里
  lenis.start()
})
</script>

<template>
  <!-- 幕布与页面同色（`--bg` = ink-0），靠字标和首屏的溶解读出来。
       aria-hidden：这是纯装饰，读屏用户不该在这里停留。 -->
  <div ref="root" class="intro-curtain fixed inset-0 z-[100] bg-bg" aria-hidden="true">
    <div class="flex h-full items-center justify-center">
      <!-- ml 补偿字距：letter-spacing 在每个字后面都加一份（含最后一个），
           于是字形整体比盒子中心偏左半个字距。 -->
      <span
        ref="word"
        class="ml-[0.16em] font-display text-[clamp(2rem,6vw,4.5rem)] leading-none font-medium tracking-[0.32em] text-fg"
        >AXLE</span
      >
    </div>
  </div>
</template>

<style scoped>
/* 幕布第一帧就该是不透明白，不需要「先 opacity:0 再显示」那套 ——
   底色和 index.html 的兜底同色，本来也看不见闪。
   字标同样不会闪：时间线里的 `from` 在 onMounted 同步建好（immediateRender），
   浏览器画第一帧时字标已经是 opacity:0。 */
.intro-curtain {
  will-change: opacity;
}
</style>
