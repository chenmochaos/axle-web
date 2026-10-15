<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Car } from '@/api/types'
import { useReveal } from '@/composables/useReveal'
import CarCard from './CarCard.vue'

defineProps<{ cars: Car[] }>()

const root = ref<HTMLElement | null>(null)

// 卡片逐个入场而非整体淡入 —— 交错是「精致」和「廉价」的分界线
useReveal(root, { children: true, stagger: 0.09, y: 40, start: 'top 82%' })
</script>

<template>
  <section id="featured" ref="root" class="mx-auto max-w-[1440px] px-8 py-24 lg:px-16 lg:py-32">
    <header class="flex items-end justify-between gap-8" data-reveal>
      <div>
        <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Featured</p>
        <h2 class="mt-4 text-[clamp(1.75rem,3vw,2.75rem)] leading-tight font-semibold tracking-[-0.03em] text-fg">
          本期精选车源
        </h2>
      </div>

      <RouterLink
        to="/cars"
        class="group hidden shrink-0 items-center gap-2 pb-1.5 text-[13px] font-medium text-fg-muted transition-colors duration-500 hover:text-fg sm:inline-flex"
      >
        查看全部车源
        <span class="transition-transform duration-500 ease-[var(--ease-cinematic)] group-hover:translate-x-1">
          →
        </span>
      </RouterLink>
    </header>

    <div class="mt-14 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="car in cars" :key="car.id" data-reveal>
        <CarCard :car="car" />
      </div>
    </div>
  </section>
</template>
