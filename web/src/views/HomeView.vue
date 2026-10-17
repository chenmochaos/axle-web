<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { fetchBrands, fetchFeaturedCars, fetchHotReviews } from '@/api/car'
import type { Brand, Car, KindFilter, Review, VehicleKind } from '@/api/types'
import { refreshScrollTriggers } from '@/composables/useReveal'
import HeroSection from '@/components/business/HeroSection.vue'
import KindTabs from '@/components/business/KindTabs.vue'
import BrandNav from '@/components/business/BrandNav.vue'
import FeaturedCars from '@/components/business/FeaturedCars.vue'
import ReviewFeed from '@/components/business/ReviewFeed.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

const brands = ref<Brand[]>([])
const cars = ref<Car[]>([])
const reviews = ref<Review[]>([])
const loaded = ref(false)

const kind = ref<KindFilter>('all')

/**
 * 切到某个大类时，把「该大类一台车都没有」的品牌整块撤掉 —— 点进去是空列表，留着是骗点击。
 *
 * `!brand.kinds` 的写法是**未知即不筛**，不是「什么都没有」：后端 `/brand/list`
 * 不返回这一列，那时把品牌全撤掉会让导航整个消失，比多显示几个品牌糟得多。
 */
const visibleBrands = computed(() =>
  kind.value === 'all'
    ? brands.value
    : brands.value.filter((b) => !b.kinds || b.kinds.includes(kind.value as VehicleKind)),
)

/** 连点两个 tab 时，先发的请求可能后回来 —— 用序号把过期响应丢掉，否则列表和 tab 会对不上 */
let requestSeq = 0

async function selectKind(next: KindFilter) {
  if (next === kind.value) return
  const seq = ++requestSeq

  const list = await fetchFeaturedCars(6, next === 'all' ? undefined : next)
  if (seq !== requestSeq) return

  // 顺序不能反：`kind` 是 FeaturedCars 的 key。先改 kind 会让组件带着**旧数据**重挂一次，
  // useReveal 的入场动画就作用在旧卡片上了；等新数据到齐时那批卡片才被替换成新的，
  // 而新卡片拿到的是 main.css 给的 `opacity: 0`，背后却没有任何动画去揭开它们 —— 整列隐形。
  // 两次赋值在同一个 tick 里，Vue 合并成一次渲染，重挂时拿到的就是新数据。
  cars.value = list
  kind.value = next

  await nextTick()
  refreshScrollTriggers()
}

onMounted(async () => {
  const [b, c, r] = await Promise.all([
    fetchBrands(),
    fetchFeaturedCars(6),
    fetchHotReviews(1),
  ])

  brands.value = b
  cars.value = c
  reviews.value = r.list
  loaded.value = true

  // 列表是 v-if 出来的，且图片加载会撑高页面 —— 两者都要让 ScrollTrigger 重算触发点。
  // 只在 nextTick 之后刷一次不够，图片 onload 时布局还在变，所以再挂一次 window load。
  await nextTick()
  refreshScrollTriggers()
  window.addEventListener('load', refreshScrollTriggers, { once: true })
})
</script>

<template>
  <!-- 单根 wrapper 是为了 <Transition>：多根节点组件不能直接做转场目标 -->
  <div>
    <HeroSection />

    <!-- 数据就绪后才挂载内容区，这样子组件 onMounted 时能拿到真实节点去做入场动画 -->
    <template v-if="loaded">
      <KindTabs :model-value="kind" @update:model-value="selectKind" />
      <BrandNav :brands="visibleBrands" />
      <!-- `:key` 不是为了重建 DOM 而是为了让 useReveal 重跑：卡片的初始 opacity: 0 来自
           main.css 的 `[data-reveal]` 规则，只有重挂组件才会重新走一遍入场动画。 -->
      <FeaturedCars :key="kind" :cars="cars" />
      <ReviewFeed :reviews="reviews" />
    </template>

    <template v-else>
      <div class="mx-auto max-w-[1440px] px-8 py-24 lg:px-16">
        <div class="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="i in 3" :key="i" class="space-y-4">
            <SkeletonBlock rounded="rounded-[1.25rem]" class="aspect-[4/3]" />
            <SkeletonBlock rounded="rounded-md" class="h-4 w-3/4" />
            <SkeletonBlock rounded="rounded-md" class="h-7 w-1/3" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
