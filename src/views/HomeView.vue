<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { fetchBrands, fetchFeaturedCars, fetchHotReviews } from '@/api/car'
import type { Brand, Car, Review } from '@/api/types'
import { refreshScrollTriggers } from '@/composables/useReveal'
import SiteLayout from '@/layouts/SiteLayout.vue'
import HeroSection from '@/components/business/HeroSection.vue'
import BrandNav from '@/components/business/BrandNav.vue'
import FeaturedCars from '@/components/business/FeaturedCars.vue'
import ReviewFeed from '@/components/business/ReviewFeed.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

const brands = ref<Brand[]>([])
const cars = ref<Car[]>([])
const reviews = ref<Review[]>([])
const loaded = ref(false)

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
  <SiteLayout>
    <HeroSection />

    <!-- 数据就绪后才挂载内容区，这样子组件 onMounted 时能拿到真实节点去做入场动画 -->
    <template v-if="loaded">
      <BrandNav :brands="brands" />
      <FeaturedCars :cars="cars" />
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
  </SiteLayout>
</template>
