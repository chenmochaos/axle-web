<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Car } from '@/api/types'
import { useCountUp } from '@/composables/useCountUp'
import AppTag from '../ui/AppTag.vue'

const props = defineProps<{ car: Car }>()

/** 二手车语境用「万」报价，比 1388000 好读 */
const priceInWan = computed(() => props.car.price / 10000)
const { display: price } = useCountUp(priceInWan, { decimals: 1, duration: 1.6 })

const specs = computed(() =>
  [
    props.car.mileage != null ? `${props.car.mileage} 万公里` : null,
    props.car.registerDate ? `${props.car.registerDate.slice(0, 4)} 年上牌` : null,
    props.car.gearbox,
  ].filter(Boolean) as string[],
)

const isFirstOwner = computed(() => props.car.ownerCount === 0)
</script>

<template>
  <article class="group">
    <RouterLink :to="`/car/${car.id}`" class="block focus-visible:outline-none">
      <!-- 车图占绝对主体。UI 退成背景，任何装饰不许抢戏。 -->
      <div class="relative aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-bg-raised">
        <img
          :data-flip-id="`car-image-${car.id}`"
          :src="car.images[0]"
          :alt="car.name"
          loading="lazy"
          decoding="async"
          class="h-full w-full object-cover transition-transform duration-[1400ms] ease-[var(--ease-cinematic)] group-hover:scale-[1.05]"
        />

        <!-- 图上文字固定在照片上，所以永远用黑白色阶（无色相），不跟主题翻转 -->
        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/75 via-black/25 to-transparent"
        />

        <div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white">
          <div class="flex flex-wrap gap-1.5">
            <span
              v-if="isFirstOwner"
              class="inline-flex h-6 items-center rounded-full bg-white/90 px-2.5 text-[11px] font-medium text-black backdrop-blur-sm"
            >
              一手车
            </span>
            <span
              v-if="car.fuel && car.fuel !== '汽油'"
              class="inline-flex h-6 items-center rounded-full bg-white/16 px-2.5 text-[11px] font-medium text-white backdrop-blur-sm"
            >
              {{ car.fuel }}
            </span>
          </div>

          <!-- hover 才露出的行动点 -->
          <span
            class="translate-y-2 text-[12px] font-medium tracking-wide whitespace-nowrap opacity-0 transition-all duration-700 ease-[var(--ease-cinematic)] group-hover:translate-y-0 group-hover:opacity-100"
          >
            查看详情 →
          </span>
        </div>

        <!-- 左上角车况分 -->
        <div
          class="absolute top-3 left-3 inline-flex h-7 items-center gap-1 rounded-full bg-black/45 px-2.5 text-[11px] font-medium text-white backdrop-blur-md tabular-nums"
        >
          <span class="text-[13px] leading-none">★</span>
          {{ car.score.toFixed(1) }}
        </div>
      </div>

      <div class="pt-4">
        <h3
          class="text-[15px] leading-snug font-medium tracking-tight text-fg transition-colors duration-300"
        >
          {{ car.name }}
        </h3>

        <p class="mt-2 flex items-baseline gap-2">
          <span class="tnum text-[26px] leading-none font-semibold tracking-tight text-fg">
            {{ price }}
          </span>
          <span class="text-[13px] font-medium text-fg-muted">万</span>
          <span
            v-if="car.originalPrice"
            class="tnum ml-auto text-[12px] text-fg-subtle line-through"
          >
            {{ (car.originalPrice / 10000).toFixed(1) }} 万
          </span>
        </p>

        <p class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-muted">
          <template v-for="(spec, i) in specs" :key="spec">
            <span v-if="i > 0" class="text-fg-subtle">·</span>
            <span class="tnum">{{ spec }}</span>
          </template>
          <AppTag v-if="car.distance != null" tone="quiet" class="ml-auto">
            {{ car.distance }} km
          </AppTag>
        </p>
      </div>
    </RouterLink>
  </article>
</template>
