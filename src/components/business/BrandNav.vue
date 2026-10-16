<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { Brand } from '@/api/types'

defineProps<{ brands: Brand[] }>()
</script>

<template>
  <!-- 零彩色下品牌识别靠字距与字重，不用彩色 logo。
       只有下边框：上边框归 KindTabs（它才是内容区的第一行），两条线挨着会把
       「切大类」和「选品牌」读成两个不相干的区块。 -->
  <nav class="border-b border-line">
    <ul class="mx-auto flex max-w-[1440px] flex-wrap px-8 lg:px-16">
      <li
        v-for="brand in brands"
        :key="brand.id"
        class="flex-1 basis-1/3 border-r border-line last:border-r-0 lg:basis-0"
      >
        <RouterLink
          :to="`/cars/${brand.id}`"
          class="group flex h-full flex-col items-center justify-center gap-1.5 px-4 py-8"
        >
          <span
            class="font-display text-[16px] font-medium tracking-[0.14em] text-fg-muted transition-colors duration-500 ease-[var(--ease-cinematic)] group-hover:text-fg"
          >
            {{ brand.mark }}
          </span>
          <span class="text-[11px] tracking-wide text-fg-subtle">
            {{ brand.name }}
            <span v-if="brand.count" class="tnum">· {{ brand.count }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
