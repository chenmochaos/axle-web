<script setup lang="ts">
/**
 * 详情页首屏：**左侧 4:3 大图 + 右侧车辆信息**，图与信息并排。
 *
 * ── 为什么不是全宽大图（M2 计划里原本的构图）───────────────────────
 *
 * 共享元素转场是这一页的主角，而全宽 hero 会让它**变形**：
 *
 * 卡片图是 4:3（1.33），全宽 hero 在 1440 宽、约 480 高时是 3:1。把卡片矩形
 * 非等比放大到 3:1，`scaleX` 与 `scaleY` 差 2.4 倍 —— 飞行途中图会被横向压扁，
 * 那不是「动得快看不清」，那是一个一眼就能看出的故障。
 * 计划里写的「靠 0.8s 的高速运动盖过去」对 1.2 倍以内的差异成立，对 2.4 倍不成立。
 *
 * 让 hero 的图区也是 **4:3**，`scaleX` 与 `scaleY` 就完全相等：不只是不变形，
 * 连裁切的画面内容都一致（两边都是同一张源图 + `object-cover` + 4:3），
 * 于是这段转场是**真的无缝**，而不是「糊过去」。代价是首屏不再是满幅照片，
 * 换来的是价格、车名、车况在第一屏就读得到 —— 详情页本来就该这样。
 *
 * ── 三条别改回去的东西 ──────────────────────────────────────────
 *
 * 1. **`pt-[4.5rem]` 必须留**：header 是 `fixed`（72px），而 `SiteLayout` 的 `<main>`
 *    没有任何顶部留白（首页靠自己的 `pt-` 顶开）。少了它，图顶被 header 压住。
 * 2. **图区的 `aspect-[4/3]` 不是装饰**，是上面那条无缝转场的前提；顺带它还让
 *    图区高度不依赖图片是否加载完 —— FLIP 量 `getBoundingClientRect()` 时布局已经定死。
 * 3. **视差图比容器高 12%**（`-top-[6%] h-[112%]`），所以 ±6% 的位移不会露边。
 *    改位移幅度时先算这个余量。
 *
 * 图集只有一张时不渲染缩略图条 —— 不为一张图做一条假的「多图」。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { Car } from '@/api/types'
import { kindOf } from '@/api/car'
import { displayName } from '@/lib/carName'
import { consumeFlipSource, flipId, flipTransform } from '@/lib/flip'
import { gsap } from '@/lib/gsap'
import { prefersReducedMotion } from '@/lib/lenis'
import { useCountUp } from '@/composables/useCountUp'
import AppTag from '../ui/AppTag.vue'

const props = defineProps<{ car: Car }>()

const root = ref<HTMLElement | null>(null)
/** FLIP 的目标，也是裁切盒 —— 转场作用于它，内部的视差图跟着一起缩放 */
const stage = ref<HTMLElement | null>(null)
const image = ref<HTMLImageElement | null>(null)
const info = ref<HTMLElement | null>(null)
const thumbs = ref<HTMLElement | null>(null)

const active = ref(0)
const images = computed(() => props.car.images.filter(Boolean))
const hasGallery = computed(() => images.value.length > 1)

const name = computed(() => displayName(props.car.name))
const kindLabel = computed(() => (kindOf(props.car) === 'motorcycle' ? '摩托车' : '汽车'))
const isFirstOwner = computed(() => props.car.ownerCount === 0)

const { display: priceWan } = useCountUp(computed(() => props.car.price / 10000), { decimals: 1 })

let ctx: gsap.Context | null = null
let fade: gsap.core.Tween | null = null

function select(index: number) {
  if (index === active.value) return
  active.value = index
  nextTick(() => {
    if (prefersReducedMotion() || !image.value) return
    fade?.kill()
    // 只是把换图那一瞬盖住。图已预载，这里不需要等 load
    fade = gsap.fromTo(image.value, { opacity: 0.35 }, { opacity: 1, duration: 0.55 })
  })
}

onMounted(() => {
  const el = root.value
  const stageEl = stage.value
  if (!el || !stageEl) return

  // 预载全部图：缩略图切换要即时，等 onload 会先闪一下空白
  images.value.forEach((src, i) => {
    if (i === 0) return
    const pre = new Image()
    pre.src = src
  })

  // 无条件取一次 —— 即使要跳过动画也得取，否则过期的矩形会一直挂在模块里（见 flip.ts）
  const source = consumeFlipSource(flipId(props.car.id))

  if (prefersReducedMotion()) {
    gsap.set([stageEl, info.value, thumbs.value].filter(Boolean), { opacity: 1, y: 0 })
    return
  }

  ctx = gsap.context(() => {
    // 视差：滚动这段首屏时图缓慢下移。容器 `overflow-hidden`，位移在 12% 余量内
    gsap.fromTo(
      image.value,
      { yPercent: -6 },
      {
        yPercent: 6,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: 0.5 },
      },
    )

    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
    const infoEl = info.value
    const thumbsEl = thumbs.value

    if (source) {
      // 起点 = 卡片图当时的位置。之后卡片所在的页面已经被卸载了，
      // 这条矩形是「那台车从哪来」唯一的凭据。
      const t = flipTransform(source.rect, stageEl.getBoundingClientRect())

      gsap.set(stageEl, {
        opacity: 1,
        transformOrigin: '0 0',
        x: t.x,
        y: t.y,
        scaleX: t.scaleX,
        scaleY: t.scaleY,
      })

      tl.to(stageEl, {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        duration: 0.85,
        // 归位后抹掉内联 transform：留下的 `scale(1)` 也是层叠上下文，
        // 会让 sticky 的操作条与 backdrop-blur 多一层合成，没必要
        clearProps: 'transform,transformOrigin',
      })
    } else {
      // 直连 / 刷新 / 前进后退：没有来处，从下方轻微上浮即可
      tl.fromTo(stageEl, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.9 }, 0)
    }

    if (infoEl) tl.fromTo(infoEl, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 0.18)
    if (thumbsEl) tl.fromTo(thumbsEl, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, 0.34)
  }, el)
})

onUnmounted(() => {
  fade?.kill()
  ctx?.revert()
})
</script>

<template>
  <section ref="root" class="pt-[4.5rem]">
    <div class="mx-auto max-w-[1440px] px-8 pt-8 pb-4 lg:px-16 lg:pt-12">
      <div class="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <!-- 图区。FLIP 目标 + 视差容器，`aspect-[4/3]` 与卡片图同比例（见文件头） -->
        <div class="detail-hero-media">
          <div
            ref="stage"
            class="detail-hero-stage relative aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-bg-raised"
          >
            <img
              ref="image"
              :src="images[active]"
              :alt="car.name"
              fetchpriority="high"
              decoding="async"
              class="absolute inset-x-0 -top-[6%] h-[112%] w-full object-cover"
            />
          </div>

          <div v-if="hasGallery" ref="thumbs" class="detail-hero-thumbs mt-4 flex gap-3">
            <button
              v-for="(src, i) in images"
              :key="src"
              type="button"
              :aria-label="`查看第 ${i + 1} 张图`"
              :aria-current="i === active"
              class="relative aspect-[4/3] w-20 overflow-hidden rounded-lg transition-all duration-500 ease-[var(--ease-cinematic)]"
              :class="i === active ? 'opacity-100' : 'opacity-45 hover:opacity-80'"
              @click="select(i)"
            >
              <img :src="src" alt="" loading="lazy" decoding="async" class="h-full w-full object-cover" />
              <!-- 选中态靠描边而不是色相 -->
              <span
                v-if="i === active"
                class="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-fg ring-inset"
              />
            </button>
          </div>
        </div>

        <!-- 信息列 -->
        <div ref="info" class="detail-hero-info">
          <p class="text-[11px] tracking-[0.18em] text-fg-subtle uppercase">
            二手车 · {{ kindLabel }}
          </p>

          <h1
            class="mt-5 text-[clamp(1.75rem,3.4vw,3rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-fg"
          >
            {{ name }}
          </h1>

          <!-- 全名与被去掉的后缀。展示名省掉了「(ND)」这类注解，但注解本身是信息，不能丢 -->
          <p v-if="car.name !== name" class="mt-3 text-[13px] text-fg-subtle">{{ car.name }}</p>

          <p class="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="tnum text-[clamp(2rem,4vw,3rem)] leading-none font-semibold tracking-tight text-fg">
              {{ priceWan }}
            </span>
            <span class="text-[15px] font-medium text-fg-muted">万</span>
            <span v-if="car.originalPrice" class="tnum text-[13px] text-fg-subtle">
              新车指导价 {{ (car.originalPrice / 10000).toFixed(1) }} 万
            </span>
          </p>

          <div class="mt-7 flex flex-wrap gap-1.5">
            <AppTag v-if="isFirstOwner" tone="strong">一手车</AppTag>
            <AppTag v-if="car.fuel">{{ car.fuel }}</AppTag>
            <AppTag v-if="car.gearbox">{{ car.gearbox }}</AppTag>
            <AppTag v-if="car.displacement">{{ car.displacement }}</AppTag>
          </div>

          <div class="mt-8 flex items-center gap-4 border-t border-line pt-6">
            <span class="text-[11px] tracking-[0.16em] text-fg-subtle uppercase">车况评分</span>
            <span class="tnum text-[20px] leading-none font-semibold tracking-tight text-fg">
              ★ {{ car.score.toFixed(1) }}
            </span>
            <span v-if="car.sold != null" class="tnum ml-auto text-[12px] text-fg-muted">
              已咨询 {{ car.sold }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* JS 挂载前先藏住，避免首帧闪一下终态 —— 与 HeroSection 同一套办法。
   JS 失败或用户要求减弱动效时，下面的媒体查询兜底显示。

   **藏的是 `ref="stage"` 自己，不是外面那层 `.detail-hero-media`。**
   GSAP 把 opacity 提到 1 是写在 stage 的内联样式上的；如果这里藏的是外层 wrapper，
   它自己的 `opacity: 0` 没人去改，内层再怎么变 1 也看不见 —— 整列大图消失，
   而 rect 依然量得到（`getBoundingClientRect()` 不管 opacity），
   于是「布局正常、图不见了」这种最难查的形态。 */
.detail-hero-stage,
.detail-hero-info,
.detail-hero-thumbs {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .detail-hero-stage,
  .detail-hero-info,
  .detail-hero-thumbs {
    opacity: 1;
  }
}
</style>
