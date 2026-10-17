<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Review } from '@/api/types'
import { useReveal } from '@/composables/useReveal'

const props = defineProps<{ reviews: Review[] }>()

const root = ref<HTMLElement | null>(null)
useReveal(root, { children: true, stagger: 0.08, y: 32, start: 'top 85%' })

/** 头条单独放大做杂志式排版，其余走列表 */
const lead = computed(() => props.reviews[0])
const rest = computed(() => props.reviews.slice(1))

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}
</script>

<template>
  <section ref="root" class="border-t border-line">
    <div class="mx-auto max-w-[1440px] px-8 py-24 lg:px-16 lg:py-32">
      <header data-reveal>
        <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Journal</p>
        <h2 class="mt-4 text-[clamp(1.75rem,3vw,2.75rem)] font-semibold tracking-[-0.03em] text-fg">
          提车作业与验车报告
        </h2>
      </header>

      <div class="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <!-- 头条 -->
        <RouterLink
          v-if="lead"
          :to="`/review/${lead.id}`"
          class="group block"
          data-reveal
        >
          <div class="aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-bg-raised">
            <img
              :src="lead.images[0]"
              :alt="lead.title"
              loading="lazy"
              class="h-full w-full object-cover transition-transform duration-[1400ms] ease-[var(--ease-cinematic)] group-hover:scale-[1.04]"
            />
          </div>

          <div class="pt-6">
            <div class="flex items-center gap-3 text-[12px] text-fg-muted">
              <span>{{ lead.author.nickName }}</span>
              <span class="text-fg-subtle">·</span>
              <span class="tnum">{{ formatDate(lead.createTime) }}</span>
            </div>

            <h3
              class="mt-3 text-[22px] leading-snug font-semibold tracking-[-0.02em] text-fg lg:text-[26px]"
            >
              {{ lead.title }}
            </h3>

            <p class="mt-3 line-clamp-3 text-[14px] leading-[1.8] text-fg-muted">
              {{ lead.content }}
            </p>

            <div class="mt-5 flex items-center gap-5 text-[12px] text-fg-subtle tabular-nums">
              <span>赞 {{ lead.liked }}</span>
              <span>评论 {{ lead.comments }}</span>
            </div>
          </div>
        </RouterLink>

        <!-- 列表 -->
        <div class="flex flex-col divide-y divide-line">
          <RouterLink
            v-for="review in rest"
            :key="review.id"
            :to="`/review/${review.id}`"
            class="group flex gap-5 py-6 first:pt-0"
            data-reveal
          >
            <div class="h-[92px] w-[124px] shrink-0 overflow-hidden rounded-xl bg-bg-raised">
              <img
                :src="review.images[0]"
                :alt="review.title"
                loading="lazy"
                class="h-full w-full object-cover transition-transform duration-[1200ms] ease-[var(--ease-cinematic)] group-hover:scale-[1.06]"
              />
            </div>

            <div class="min-w-0 flex-1">
              <h3
                class="line-clamp-2 text-[15px] leading-snug font-medium tracking-tight text-fg"
              >
                {{ review.title }}
              </h3>
              <p class="mt-2 flex items-center gap-2 text-[12px] text-fg-subtle">
                <span>{{ review.author.nickName }}</span>
                <span>·</span>
                <span class="tnum">赞 {{ review.liked }}</span>
              </p>
            </div>
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
