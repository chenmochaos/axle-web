<script setup lang="ts">
/**
 * 首屏 —— 白色影棚里的「大字号排版 + 车居中」。
 *
 * 2026-10-15 从「纯黑展台」改判：车辆图是抠图资产、本身没有场景，放纯黑上
 * 要靠界面补三层空间感（顶光 / 地平线 / 暗角）才不让车飘起来 —— 那是界面在替照片演戏。
 * 白底上车直接成立，界面退到只剩排版，于是排版必须自己扛住画面。
 *
 * 两条硬规矩，改动时别破坏：
 *
 * 1. **车台盒子尺寸写死**（`.hero-stage`），车图在盒内 `object-contain` + 贴底。
 *    所以换车时页面高度一动不动；副作用是所有车按**高度**归一、轮胎着地线恒定，
 *    倒影和接地阴影才有稳定基准。上一版是「宽度定死 + h-auto」，车越高整块越高，
 *    换一次车页面就跳一次 —— 这是 Minus 报的第一个问题，别改回去。
 *
 * 2. **车台居中于「标题底边 → 车名顶边」之间的剩余空间**（`.hero-stage-layer` 是 `flex-1` 的正常流元素）。
 *    曾经用 `absolute inset-0 grid place-items-center` 钉在视口正中，但视口正中 ≠ 视觉居中：
 *    上方是两行超大标题（视觉重量大），下方只有一行车名 —— 按视口居中时车读起来仍然偏高，
 *    这正是 Minus 报的第三个问题。改由 flex 分配剩余空间后，车自动落在标题与文案之间的重心上。
 *
 * 换车刻意用「淡出 → 淡入」而不是横向滑动：滑动是列表语言，
 * 淡入淡出是赛车游戏选车画面的语言。
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { gsap } from '@/lib/gsap'
import { prefersReducedMotion } from '@/lib/lenis'
import { useScrollTo } from '@/composables/useScrollTo'
import { fetchHeroCars } from '@/api/car'
import type { Car } from '@/api/types'
import AppButton from '../ui/AppButton.vue'

const { scrollTo } = useScrollTo()

const root = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const meta = ref<HTMLElement | null>(null)

const cars = ref<Car[]>([])
const active = ref(0)
const paused = ref(false)
const switching = ref(false)

let ctx: gsap.Context | null = null
let timer: number | undefined

const ROTATE_MS = 5600

const current = computed(() => cars.value[active.value])

/** 抠图优先；后端不返回 cutout 时回退到原图，不至于开天窗 */
const heroSrc = (car: Car) => car.cutout ?? car.images[0]

/** 首屏车名走展示体，不想要「(992)」这种底盘代号后缀 */
const displayName = computed(() => current.value?.name.replace(/\s*[（(][^)）]*[)）]\s*$/, '') ?? '')

const specs = computed(() => {
  const c = current.value
  if (!c) return []
  return [
    c.registerDate ? `${c.registerDate.slice(0, 4)} 年上牌` : null,
    c.mileage != null ? `${c.mileage} 万公里` : null,
    c.displacement ?? c.fuel,
    c.gearbox,
  ].filter(Boolean) as string[]
})

const priceWan = computed(() => (current.value ? (current.value.price / 10000).toFixed(1) : ''))

/**
 * 换车：淡出 → 换数据 → 淡入。
 *
 * 用 GSAP 而不是 <Transition>：车和下方文字分处两个容器（车在绝对定位的车台层，
 * 文字在正常流里），包不进同一个 keyed 元素，两个 Transition 的时序又对不齐。
 * 手动控制反而更简单，也保证「车和字同时淡出、同时淡入」。
 */
async function go(index: number) {
  if (index === active.value || switching.value || !cars.value.length) return
  switching.value = true
  stopTimer()

  const targets = [stage.value, meta.value].filter(Boolean)

  if (!prefersReducedMotion()) {
    await gsap.to(targets, {
      opacity: 0,
      y: -12,
      duration: 0.42,
      ease: 'power2.in',
      stagger: 0.05,
    })
  }

  active.value = index
  await nextTick()

  if (prefersReducedMotion()) {
    gsap.set(targets, { opacity: 1, y: 0 })
  } else {
    await gsap.fromTo(
      targets,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.85, ease: 'expo.out', stagger: 0.09 },
    )
  }

  switching.value = false
  startTimer()
}

function next() {
  go((active.value + 1) % cars.value.length)
}

function startTimer() {
  if (prefersReducedMotion() || cars.value.length < 2) return
  stopTimer()
  timer = window.setInterval(() => {
    if (!paused.value) next()
  }, ROTATE_MS)
}

function stopTimer() {
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

onMounted(async () => {
  const el = root.value
  if (!el) return

  cars.value = await fetchHeroCars()
  await nextTick()

  // 先把所有车图预载，否则轮换时会闪一下空白
  cars.value.forEach((c) => {
    const img = new Image()
    img.src = heroSrc(c)
  })

  const intro = ['.hero-eyebrow', '.hero-headline', '.hero-meta', '.hero-cta', '.hero-dots']
  const scene = ['.hero-stage', '.hero-ground']

  if (prefersReducedMotion()) {
    gsap.set([...intro, ...scene].filter(Boolean), { opacity: 1, y: 0 })
    startTimer()
    return
  }

  ctx = gsap.context(() => {
    gsap.set([...intro, ...scene].filter(Boolean), { opacity: 0, y: 24 })
    gsap.set(stage.value, { y: 34 })

    gsap
      .timeline({ defaults: { ease: 'expo.out' } })
      .to('.hero-ground', { opacity: 1, y: 0, duration: 1.6 }, 0)
      .to('.hero-eyebrow', { opacity: 1, y: 0, duration: 0.9 }, 0.1)
      .to('.hero-headline', { opacity: 1, y: 0, duration: 1.1 }, 0.22)
      // 车最后到位 —— 它是主角，让它在标题之后「开上展台」
      .to(stage.value, { opacity: 1, y: 0, duration: 1.5 }, 0.5)
      .to('.hero-meta', { opacity: 1, y: 0, duration: 1 }, 0.95)
      .to('.hero-cta', { opacity: 1, y: 0, duration: 1 }, 1.15)
      .to('.hero-dots', { opacity: 1, y: 0, duration: 0.9 }, 1.35)
      .add(() => startTimer())

    // 滚动：整个内容层缓慢上浮淡出。位移刻意很小（-6%），幅度大了会破坏「车居中」这个构图前提。
    // 只推 .hero-content 一层 —— 车台现在在它内部，两层一起推会叠加成 -12%。
    gsap.to('.hero-content', {
      yPercent: -6,
      opacity: 0,
      ease: 'none',
      scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: 0.6 },
    })
  }, el)
})

onUnmounted(() => {
  stopTimer()
  ctx?.revert()
})
</script>

<template>
  <section
    ref="root"
    class="relative min-h-[100svh] overflow-hidden bg-bg"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <!-- 地面：底部一层极淡的灰，暗示车停在地板上而不是浮在白纸里 -->
    <div class="hero-ground pointer-events-none absolute inset-x-0 bottom-0 h-1/3" />

    <div
      class="hero-content relative z-10 mx-auto flex min-h-[100svh] max-w-[1440px] flex-col items-center px-8 pt-[max(5.5rem,9vh)] pb-[max(2.5rem,5vh)] lg:px-16"
    >
      <!-- 中英分开给字距：0.34em 拉拉丁字母是疏朗，拉中文是把词拆散 -->
      <p class="hero-eyebrow text-[11px] text-fg-subtle">
        <span class="tracking-[0.34em] uppercase">AXLE</span>
        <span class="px-1">·</span>
        <span class="tracking-[0.12em]">严选二手性能车</span>
      </p>

      <h1
        class="hero-headline mt-[3vh] max-w-[22ch] font-display text-center text-[clamp(2.1rem,6vw,5rem)] leading-[0.94] font-medium tracking-[0.02em] uppercase"
      >
        Every car deserves<br />a second start
      </h1>

      <!-- 车台：吃掉标题与文案之间的剩余空间，车在其中垂直居中（见文件头第 2 条）。 -->
      <div
        class="hero-stage-layer pointer-events-none flex min-h-0 flex-1 items-center justify-center"
      >
        <div
          v-if="current"
          ref="stage"
          class="hero-stage pointer-events-auto relative h-[clamp(12.5rem,32vh,21rem)] w-[min(80vw,1000px)]"
        >
          <!-- object-contain + object-bottom：车按高度归一，且永远贴着盒子下沿。
               盒子尺寸写死 → 换车时页面高度不变（原问题 1 的修复点）。 -->
          <img
            :src="heroSrc(current)"
            :alt="current.name"
            fetchpriority="high"
            decoding="async"
            class="absolute inset-0 h-full w-full object-contain object-bottom"
          />

          <!-- 接地阴影：白底上唯一给车「重量」的东西 -->
          <div class="hero-contact pointer-events-none absolute top-full left-1/2" />

          <!-- 倒影：与车图同尺寸、同 object 设置，绕自身**底边**镜像 ——
               镜像后最高的一行正好是原图最低的一行（轮胎），与地面线严丝合缝。
               （绕顶边镜像的话倒影会翻到车身上去，这里必须是 bottom center。） -->
          <div class="hero-reflect pointer-events-none absolute top-full left-0 h-full w-full">
            <img
              :src="heroSrc(current)"
              alt=""
              aria-hidden="true"
              class="h-full w-full object-contain object-bottom"
              style="transform: scaleY(-1); transform-origin: bottom center"
            />
          </div>
        </div>
      </div>

      <!-- 车名与参数。用 out-in 的时序跟着车一起淡出淡入。 -->
      <div v-if="current" ref="meta" class="hero-meta text-center">
        <p
          class="font-display text-[clamp(1.05rem,1.7vw,1.5rem)] leading-none font-medium tracking-[0.09em] text-fg uppercase"
        >
          {{ displayName }}
        </p>
        <p class="tnum mt-3.5 text-[13px] text-fg-muted">
          <template v-for="(s, i) in specs" :key="s">
            <span v-if="i > 0" class="px-1.5 text-fg-subtle">·</span>{{ s }}
          </template>
          <span class="px-1.5 text-fg-subtle">·</span>
          <span class="font-medium text-fg">{{ priceWan }} 万</span>
        </p>
      </div>

      <div class="hero-cta mt-8 flex flex-wrap items-center justify-center gap-3">
        <AppButton size="lg" @click="scrollTo('#featured')">浏览车源</AppButton>
        <AppButton variant="outline" size="lg" to="/cars">预约看车</AppButton>
      </div>

      <!-- 换车指示器。零彩色：靠明度区分选中态，不用品牌色高亮。 -->
      <div v-if="cars.length > 1" class="hero-dots mt-8 flex items-center gap-2.5">
        <button
          v-for="(car, i) in cars"
          :key="car.id"
          type="button"
          :aria-label="`查看 ${car.name}`"
          :aria-current="i === active"
          class="h-1.5 rounded-full transition-all duration-700 ease-[var(--ease-cinematic)]"
          :class="i === active ? 'w-7 bg-fg' : 'w-1.5 bg-fg/20 hover:bg-fg/40'"
          @click="go(i)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 地面：白 → 极淡灰的过渡，给画面一个「地板」 */
.hero-ground {
  background: linear-gradient(to bottom, transparent, var(--color-ink-100));
}

/* 接地阴影：扁椭圆骑在地面线上，一半在上（车底压暗）一半在下（地面变暗）。
   宽高比写死并用 aspect-ratio 而非百分比高度 —— 百分比高度在这个绝对定位元素上没有解析基准。 */
.hero-contact {
  width: 66%;
  aspect-ratio: 14 / 1;
  transform: translate(-50%, -50%);
  background: radial-gradient(ellipse 50% 50% at 50% 50%, rgb(0 0 0 / 0.18), transparent 70%);
  filter: blur(12px);
}

/* 倒影：只留车高的 30% 就渐隐到零，裁切线（70%）与渐隐终点（30%）对齐。
   为什么这么短：车台在剩余空间里居中，车名就压在下沿外约 80px 处，
   倒影长了会以一层灰蒙在车名上。两层都必须在容器上 ——
   加在图上，图的坐标系和容器不一致，渐变会错位。 */
.hero-reflect {
  opacity: 0.15;
  clip-path: inset(0 0 70% 0);
  -webkit-mask-image: linear-gradient(to bottom, rgb(0 0 0 / 0.8), transparent 30%);
  mask-image: linear-gradient(to bottom, rgb(0 0 0 / 0.8), transparent 30%);
}

/* JS 挂载前先藏住，避免首帧闪一下终态。
   JS 失败或用户要求减弱动效时，下面的媒体查询兜底显示。 */
.hero-eyebrow,
.hero-headline,
.hero-meta,
.hero-cta,
.hero-dots,
.hero-stage,
.hero-ground {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .hero-eyebrow,
  .hero-headline,
  .hero-meta,
  .hero-cta,
  .hero-dots,
  .hero-stage,
  .hero-ground {
    opacity: 1;
  }
}
</style>
