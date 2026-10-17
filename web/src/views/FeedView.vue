<script setup lang="ts">
/**
 * 关注动态 `/feed`。需要登录。
 *
 * ── 游标分页，不是页码 ──────────────────────────────────────────────────
 *
 * 后端用 Redis ZSET 做收件箱（`feed:{userId}`，score = 发布时间毫秒），
 * 接口参数是 `lastId` + `offset`，返回 `minTime` + `offset`。下一轮把返回的
 * 这两个值原样传回去 —— **绝不能自己拼页码**：ZSET 里没有「第 2 页」这个概念，
 * 传 `lastId=0` 只会拿到底部那一截。
 *
 * `hasMore` 的判据是「这一页满了」：后端不返回 total。代价是恰好满页时会多一次
 * 空请求，这是没有 total 时唯一不撒谎的写法。
 *
 * ── 为什么首次 `lastId = Date.now()` ────────────────────────────────────
 *
 * 后端把它当 `reverseRangeByScoreWithScores` 的 `max`。给一个未来时间等价于
 * 「从最新一条开始」。给 0 会从 ZSET 底部开始 —— 那是「最旧的 5 条」。
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NeedLoginError } from '@/api/client'
import { fetchFollowFeed } from '@/api/review'
import type { Review } from '@/api/types'
import { useRequireLogin } from '@/composables/useRequireLogin'
import { useReveal } from '@/composables/useReveal'
import ReviewCard from '@/components/business/ReviewCard.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import AppButton from '@/components/ui/AppButton.vue'

const route = useRoute()
const router = useRouter()
const { ensure } = useRequireLogin()

const reviews = ref<Review[]>([])
/** 下一次请求的游标。首次是一个未来时间，等价于「从最新开始」 */
const cursorTime = ref(Date.now())
const cursorOffset = ref(0)

const hasMore = ref(false)
const loading = ref(false)
const loaded = ref(false)
const error = ref('')

const pageRoot = ref<HTMLElement | null>(null)
useReveal(pageRoot, { children: true, stagger: 0.08, y: 30, ready: loaded })

async function loadNext(first = false): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = ''

  try {
    const page = await fetchFollowFeed(cursorTime.value, cursorOffset.value)

    const known = new Set(reviews.value.map((r) => r.id))
    reviews.value = [...reviews.value, ...page.list.filter((r) => !known.has(r.id))]

    cursorTime.value = page.minTime
    cursorOffset.value = page.offset
    // `minTime > 0` 是防御：createTime 缺失时 score 会是 0，
    // 继续传 0 只会反复请求同一段并永远说「还有」。
    hasMore.value = page.hasMore && page.minTime > 0

    if (first) loaded.value = true
  } catch (err) {
    if (err instanceof NeedLoginError) {
      await router.push({ name: 'login', query: { next: route.fullPath } })
      return
    }
    error.value = err instanceof Error ? err.message : '加载失败，请稍后重试'
    if (first) loaded.value = true
  } finally {
    loading.value = false
    if (first) loaded.value = true
  }
}

onMounted(async () => {
  if (!(await ensure())) {
    loaded.value = true
    return
  }
  await loadNext(true)
})
</script>

<template>
  <div ref="pageRoot" class="pt-[4.5rem]">
    <section class="mx-auto max-w-[1440px] px-8 pt-16 pb-10 lg:px-16 lg:pt-24">
      <header class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between" data-reveal>
        <div>
          <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Following</p>
          <h1
            class="mt-4 text-[clamp(2rem,4vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-fg"
          >
            关注动态
          </h1>
          <p class="mt-5 max-w-[34rem] text-[14px] leading-[1.9] text-pretty text-fg-muted">
            你关注的车商与车友发布的新口碑会出现在这里，最新的在前。
          </p>
        </div>

        <AppButton variant="outline" to="/review">逛口碑广场</AppButton>
      </header>
    </section>

    <section class="mx-auto max-w-[46rem] px-8 pb-24 lg:px-16 lg:pb-32">
      <div v-if="!loaded" class="space-y-14">
        <div v-for="n in 3" :key="n" class="space-y-4">
          <SkeletonBlock rounded="rounded-[1.25rem]" class="aspect-[16/9]" />
          <SkeletonBlock rounded="rounded-md" class="h-3 w-28" />
          <SkeletonBlock rounded="rounded-md" class="h-6 w-3/4" />
        </div>
      </div>

      <div
        v-else-if="reviews.length === 0"
        class="border-t border-line py-20 text-center"
        data-reveal
      >
        <p class="text-[14px] text-fg-muted">
          还没有动态。去口碑广场逛逛，关注感兴趣的作者。
        </p>
        <div class="mt-8 flex justify-center gap-3">
          <AppButton to="/review">口碑广场</AppButton>
          <AppButton variant="outline" to="/cars">浏览车源</AppButton>
        </div>
      </div>

      <template v-else>
        <div class="flex flex-col gap-16">
          <ReviewCard v-for="review in reviews" :key="review.id" :review="review" />
        </div>

        <p v-if="error" class="mt-8 text-center text-[13px] text-fg" role="alert">
          <span aria-hidden="true">—&nbsp;</span>{{ error }}
        </p>

        <div v-if="hasMore" class="mt-16 flex justify-center">
          <AppButton variant="outline" :loading="loading" @click="loadNext()">
            {{ loading ? '加载中…' : '加载更多' }}
          </AppButton>
        </div>
        <p v-else class="mt-16 text-center text-[12px] tracking-wide text-fg-subtle">
          已经到底了
        </p>
      </template>
    </section>
  </div>
</template>
