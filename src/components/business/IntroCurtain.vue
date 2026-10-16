<script setup lang="ts">
/**
 * 开场幕布：黑场 → 字标逐字升起 → 字标退场 → 整块黑幕向上抽走。
 *
 * 只在满足条件时挂载（首页 + 本次会话首次 + 未要求减弱动效）。**判断不在这里** ——
 * 条件写在 `index.html` 的内联脚本里，`lib/intro.ts` 导出 `introWillPlay` 供 `App.vue` 使用。
 * 重复判断条件只会让两处慢慢跑偏，所以这里只负责播。
 *
 * 时序（秒，与 docs/specs §6.4 的表一致）：
 *
 * | t | 动作 |
 * |---|---|
 * | 0.12 | 字标逐字自下升起（mask 遮罩，stagger 0.045） |
 * | 0.92 | 字标逐字上移退出 |
 * | 1.12 | 幕布 `yPercent: -100`，expo.inOut，1.1s |
 * | 1.505 | **交接点**：放行首屏时间线 |
 * | ~2.22 | 幕布完全抽走，`lenis.start()`，卸载自己 |
 *
 * 交接点为什么在 35% 而不是幕布结束：那是「电影感」的来源 —— 首屏在幕布还在升的时候
 * 就起手，两段重叠成一次运动。太早（<20%）首屏在黑幕后面白演一遍；太晚（=100%）
 * 能看出这是两段动画接起来的。注意 expo.inOut 在 35% 时间点只走完约 6% 距离，
 * 所以「35% 放行」实际是「幕布几乎还盖着就放行，首屏在幕布快速揭开的瞬间露出来」。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap, SplitText } from '@/lib/gsap'
import { lenis } from '@/lib/lenis'
import { clearBootPaint, finishIntro } from '@/lib/intro'

const emit = defineEmits<{ done: [] }>()

const root = ref<HTMLElement | null>(null)
const word = ref<HTMLElement | null>(null)

const WORD_IN = 0.12
const WORD_OUT = 0.92
const CURTAIN = 1.12
const CURTAIN_DUR = 1.1
/** 交接点占幕布上升时长的比例 */
const HANDOFF = 0.35

let tl: gsap.core.Timeline | null = null
let split: SplitText | null = null

onMounted(() => {
  // 幕布自己的黑已经画上去了，撤掉 <html> 上的兜底黑（否则滚到底会露黑边）
  clearBootPaint()
  // 幕布期间锁滚动：黑幕后面露出半截已经滚到中间的页面会很出戏
  lenis.stop()

  // mask: 'chars' 让每个字各自被一个裁剪盒包住，逐字「从下面升上来」
  split = SplitText.create(word.value, { type: 'chars', mask: 'chars' })

  tl = gsap.timeline({
    onComplete: () => {
      lenis.start()
      emit('done')
    },
  })

  tl.from(
    split.chars,
    { yPercent: 115, duration: 0.9, ease: 'expo.out', stagger: 0.045 },
    WORD_IN,
  )
    .to(split.chars, { yPercent: -110, duration: 0.55, ease: 'expo.in', stagger: 0.03 }, WORD_OUT)
    .to(root.value, { yPercent: -100, duration: CURTAIN_DUR, ease: 'expo.inOut' }, CURTAIN)
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
  <!-- 反色 token 复用既有的黑（--invert-bg = ink-950），零彩色规矩不破。
       aria-hidden：这是纯装饰，读屏用户不该在这里停留。 -->
  <div ref="root" class="intro-curtain fixed inset-0 z-[100] bg-invert" aria-hidden="true">
    <div class="flex h-full items-center justify-center">
      <!-- ml 补偿字距：letter-spacing 在每个字后面都加一份（含最后一个），
           于是字形整体比盒子中心偏左半个字距。 -->
      <span
        ref="word"
        class="ml-[0.16em] font-display text-[clamp(2rem,6vw,4.5rem)] leading-none font-medium tracking-[0.32em] text-invert-fg"
        >AXLE</span
      >
    </div>
  </div>
</template>

<style scoped>
/* 幕布第一帧就该是不透明的黑，不需要「先 opacity:0 再显示」那套 ——
   底色和 index.html 的兜底黑同色，本来也看不见闪。
   字标同样不会闪：时间线里的 `from` 在 onMounted 同步建好（immediateRender），
   浏览器画第一帧时字标已经在遮罩下面了。 */
.intro-curtain {
  will-change: transform;
}
</style>
