<script setup lang="ts">
/**
 * 口碑卡片。口碑广场、关注流、车商主页、个人中心共用这一张 ——
 * 四处各写一遍，必然在「有没有图」「作者名空不空」这些边角上漂移。
 */
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Review } from '@/api/types'
import { useReveal } from '@/composables/useReveal'
import { monthDay } from '@/lib/time'

defineProps<{ review: Review }>()

const root = ref<HTMLElement | null>(null)
useReveal(root)
</script>

<template>
  <div ref="root" data-reveal>
    <RouterLink :to="`/review/${review.id}`" class="group block">
      <div
        v-if="review.images[0]"
        class="aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-bg-raised"
      >
        <img
          :src="review.images[0]"
          :alt="review.title"
          loading="lazy"
          class="h-full w-full object-cover transition-transform duration-[1400ms] ease-[var(--ease-cinematic)] group-hover:scale-[1.04]"
        />
      </div>

      <div class="pt-5">
        <p class="flex items-center gap-2 text-[12px] text-fg-muted">
          <span class="truncate">{{ review.author.nickName }}</span>
          <span class="text-fg-subtle">·</span>
          <span class="tnum shrink-0">{{ monthDay(review.createTime) }}</span>
        </p>

        <h3 class="mt-2.5 line-clamp-2 text-[17px] leading-snug font-semibold tracking-[-0.02em] text-fg">
          {{ review.title }}
        </h3>

        <p v-if="review.content" class="mt-2 line-clamp-2 text-[13px] leading-[1.8] text-fg-muted">
          {{ review.content }}
        </p>

        <p class="mt-4 flex items-center gap-4 text-[12px] text-fg-subtle tabular-nums">
          <span>{{ review.isLiked ? '已赞' : '赞' }} {{ review.liked }}</span>
          <span>评论 {{ review.comments }}</span>
        </p>
      </div>
    </RouterLink>
  </div>
</template>
