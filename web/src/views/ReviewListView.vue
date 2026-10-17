<script setup lang="ts">
/**
 * 口碑广场 `/review`。展示热门口碑（后端按 `liked` 降序），分页加载。
 *
 * 「热门」而不是「最新」：后端 `/review/hot` 的排序就是 `ORDER BY liked DESC`，
 * 没有「最新」接口（`/review/of/user` 要指定作者）。前端不伪造一个「最新」标签去
 * 误导用户 —— 控件只在后端真的支持时才存在，这条与 `/cars` 不做价格排序同理。
 */
import { onMounted, ref } from 'vue'
import { fetchHotReviews } from '@/api/car'
import type { Review } from '@/api/types'
import { useReveal } from '@/composables/useReveal'
import ReviewCard from '@/components/business/ReviewCard.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import AppButton from '@/components/ui/AppButton.vue'

const reviews = ref<Review[]>([])
const current = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const loaded = ref(false)

const pageRoot = ref<HTMLElement | null>(null)
useReveal(pageRoot, { children: true, stagger: 0.08, y: 32, ready: loaded })

async function load(page: number): Promise<void> {
  loading.value = true
  try {
    const result = await fetchHotReviews(page)
    // 页码分页可能因为「热门排序变化」而重复/漏条。按 id 去重，
    // 顺带挡住「快速连点两次加载更多」造成的重复追加。
    const known = new Set(reviews.value.map((r) => r.id))
    reviews.value = [...reviews.value, ...result.list.filter((r) => !known.has(r.id))]
    current.value = page
    hasMore.value = result.hasMore
  } finally {
    loading.value = false
    loaded.value = true
  }
}

onMounted(() => void load(1))
</script>

<template>
  <div ref="pageRoot" class="pt-[4.5rem]">
    <section class="mx-auto max-w-[1440px] px-8 pt-16 pb-10 lg:px-16 lg:pt-24">
      <header class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between" data-reveal>
        <div>
          <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Journal</p>
          <h1
            class="mt-4 text-[clamp(2rem,4vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-fg"
          >
            口碑广场
          </h1>
          <p class="mt-5 max-w-[34rem] text-[14px] leading-[1.9] text-pretty text-fg-muted">
            提车作业、验车报告与长期用车记录。按点赞数排序 —— 被更多人验证过的经验排在前面。
          </p>
        </div>

        <AppButton to="/review/edit">发布口碑</AppButton>
      </header>
    </section>

    <section class="mx-auto max-w-[1440px] px-8 pb-24 lg:px-16 lg:pb-32">
      <!-- 骨架屏：三列卡片，加载完不跳版 -->
      <div v-if="!loaded" class="grid grid-cols-1 gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in 6" :key="n" class="space-y-4">
          <SkeletonBlock rounded="rounded-[1.25rem]" class="aspect-[4/3]" />
          <SkeletonBlock rounded="rounded-md" class="h-3 w-24" />
          <SkeletonBlock rounded="rounded-md" class="h-5 w-4/5" />
          <SkeletonBlock rounded="rounded-md" class="h-3 w-2/3" />
        </div>
      </div>

      <div
        v-else-if="reviews.length === 0"
        class="border-t border-line py-20 text-center"
        data-reveal
      >
        <p class="text-[14px] text-fg-muted">还没有口碑。第一篇可以是你写的。</p>
        <div class="mt-8 flex justify-center">
          <AppButton to="/review/edit">写第一篇</AppButton>
        </div>
      </div>

      <template v-else>
        <div class="grid grid-cols-1 gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          <ReviewCard v-for="review in reviews" :key="review.id" :review="review" />
        </div>

        <div v-if="hasMore" class="mt-16 flex justify-center">
          <AppButton variant="outline" :loading="loading" @click="load(current + 1)">
            {{ loading ? '加载中…' : '加载更多' }}
          </AppButton>
        </div>
      </template>
    </section>
  </div>
</template>
