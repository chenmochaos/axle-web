<script setup lang="ts">
/**
 * 车商 / 车评人主页 `/dealer/:id`。**公开页**：资料与口碑不登录也能看。
 *
 * 只有两件事依赖登录：关注按钮的状态、以及「共同关注」。
 * 未登录时不为它们发请求 —— `GET /follow/or/not/{id}` 与 `/follow/common/{id}`
 * 都读 `UserHolder`，游客调用就是 401，而这是公开页，不该出现一串登录错误。
 *
 * 粉丝数在页面上是「关注动作的前后差」而不是重新拉一遍接口：
 * `PUT /follow` 返回空 data，没有新计数可读。这里只在**接口成功之后**才 ±1，
 * 失败不动数字 —— 乐观 +1 再回滚，会让用户看到一次假的涨粉。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError } from '@/api/client'
import { fetchReviewsOfUser } from '@/api/review'
import { fetchCommonFollows, fetchProfile } from '@/api/social'
import type { Review, User, UserProfile } from '@/api/types'
import { useReveal } from '@/composables/useReveal'
import { useAuthStore } from '@/stores/auth'
import FollowButton from '@/components/business/FollowButton.vue'
import ReviewCard from '@/components/business/ReviewCard.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import AppButton from '@/components/ui/AppButton.vue'

const route = useRoute()
const auth = useAuthStore()

const profile = ref<UserProfile | null>(null)
const reviews = ref<Review[]>([])
const commons = ref<User[]>([])
const current = ref(1)
const hasMore = ref(false)
const loadingMore = ref(false)
const loaded = ref(false)
const notFound = ref(false)
/** 网络/服务端错误。与「这个人不存在」是两个不同的空态，不能合并 */
const error = ref('')

const pageRoot = ref<HTMLElement | null>(null)
useReveal(pageRoot, { children: true, stagger: 0.08, y: 28, ready: loaded })

const isSelf = computed(() => auth.user?.id != null && auth.user.id === profile.value?.id)
const initial = computed(() => profile.value?.nickName.slice(0, 1) ?? '')

async function loadReviews(page: number): Promise<void> {
  if (!profile.value) return
  loadingMore.value = true
  try {
    const result = await fetchReviewsOfUser(profile.value.id, page)
    const known = new Set(reviews.value.map((r) => r.id))
    reviews.value = [...reviews.value, ...result.list.filter((r) => !known.has(r.id))]
    current.value = page
    hasMore.value = result.hasMore
  } finally {
    loadingMore.value = false
  }
}

onMounted(async () => {
  const id = Number(route.params.id)
  if (!Number.isFinite(id)) {
    notFound.value = true
    loaded.value = true
    return
  }

  try {
    profile.value = await fetchProfile(id)
    const first = await fetchReviewsOfUser(id, 1)
    reviews.value = first.list
    hasMore.value = first.hasMore
  } catch (err) {
    // 只有「用户不存在」是空态；网络错误必须让页面进错误分支，而不是伪装成没有这个人
    if (err instanceof ApiError && err.message === '用户不存在') {
      notFound.value = true
    } else {
      error.value = err instanceof Error ? err.message : '加载失败，请稍后重试'
    }
  } finally {
    loaded.value = true
  }

  // 社交部分单独走：它失败不该影响已经拿到的资料和口碑
  if (!auth.ready) await auth.restore()
  if (profile.value && auth.isLoggedIn && !isSelf.value) {
    try {
      commons.value = await fetchCommonFollows(id)
    } catch {
      // 共同关注拿不到就不显示，不打断页面
    }
  }
})

function onFollowChange(following: boolean): void {
  if (!profile.value) return
  profile.value.fans = Math.max(0, profile.value.fans + (following ? 1 : -1))
}
</script>

<template>
  <div ref="pageRoot" class="pt-[4.5rem]">
    <div v-if="!loaded" class="mx-auto max-w-[1440px] px-8 py-16 lg:px-16 lg:py-24">
      <div class="flex items-center gap-6">
        <SkeletonBlock rounded="rounded-full" class="h-20 w-20" />
        <div class="space-y-3">
          <SkeletonBlock rounded="rounded-md" class="h-7 w-40" />
          <SkeletonBlock rounded="rounded-md" class="h-3 w-24" />
        </div>
      </div>
      <div class="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonBlock v-for="n in 3" :key="n" rounded="rounded-[1.25rem]" class="aspect-[4/3]" />
      </div>
    </div>

    <section
      v-else-if="error"
      class="mx-auto flex min-h-[70svh] max-w-[1440px] flex-col justify-center px-8 lg:px-16"
    >
      <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Error</p>
      <h1
        class="mt-5 text-[clamp(1.75rem,4vw,2.75rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
      >
        主页加载失败
      </h1>
      <p class="mt-5 max-w-[30rem] text-[14px] leading-[1.9] text-fg-muted">{{ error }}</p>
      <div class="mt-9">
        <AppButton @click="$router.go(0)">重试</AppButton>
      </div>
    </section>

    <section
      v-else-if="notFound || !profile"
      class="mx-auto flex min-h-[70svh] max-w-[1440px] flex-col justify-center px-8 lg:px-16"
    >
      <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Not found</p>
      <h1
        class="mt-5 text-[clamp(1.75rem,4vw,2.75rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
      >
        没有找到这位车商
      </h1>
      <div class="mt-9">
        <AppButton to="/review">回到口碑广场</AppButton>
      </div>
    </section>

    <template v-else>
      <section class="mx-auto max-w-[1440px] px-8 pt-16 pb-12 lg:px-16 lg:pt-24">
        <div class="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between" data-reveal>
          <div class="flex items-center gap-6">
            <img
              v-if="profile.icon"
              :src="profile.icon"
              alt=""
              class="h-20 w-20 rounded-full object-cover"
            />
            <span
              v-else
              class="grid h-20 w-20 place-items-center rounded-full border border-line text-[26px] font-medium text-fg"
            >
              {{ initial }}
            </span>

            <div>
              <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">
                Dealer
              </p>
              <h1
                class="mt-2 text-[clamp(1.5rem,3vw,2.25rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
              >
                {{ profile.nickName }}
              </h1>
              <p class="mt-2 text-[12px] text-fg-subtle tabular-nums">
                {{ profile.fans }} 粉丝 · 关注 {{ profile.followee }} · {{ profile.reviews }} 篇口碑
              </p>
            </div>
          </div>

          <FollowButton v-if="!isSelf" :user-id="profile.id" @change="onFollowChange" />
          <p v-else class="text-[12px] text-fg-subtle">这是你的主页</p>
        </div>

        <div v-if="commons.length" class="mt-10 border-t border-line pt-6" data-reveal>
          <p class="text-[11px] tracking-[0.18em] text-fg-subtle uppercase">共同关注</p>
          <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
            <RouterLink
              v-for="user in commons"
              :key="user.id"
              :to="`/dealer/${user.id}`"
              class="flex items-center gap-2 text-[12px] text-fg-muted transition-colors duration-300 hover:text-fg"
            >
              <img
                v-if="user.icon"
                :src="user.icon"
                alt=""
                class="h-6 w-6 rounded-full object-cover"
              />
              <span
                v-else
                class="grid h-6 w-6 place-items-center rounded-full border border-line text-[10px] text-fg"
              >
                {{ user.nickName.slice(0, 1) }}
              </span>
              {{ user.nickName }}
            </RouterLink>
          </div>
        </div>
      </section>

      <section class="mx-auto max-w-[1440px] px-8 pb-24 lg:px-16 lg:pb-32">
        <p class="border-t border-line pt-8 text-[11px] tracking-[0.18em] text-fg-subtle uppercase">
          Reviews
        </p>

        <div
          v-if="reviews.length === 0"
          class="py-16 text-center"
          data-reveal
        >
          <p class="text-[14px] text-fg-muted">还没有发布过口碑。</p>
        </div>

        <template v-else>
          <div class="mt-10 grid grid-cols-1 gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            <ReviewCard v-for="review in reviews" :key="review.id" :review="review" />
          </div>

          <div v-if="hasMore" class="mt-16 flex justify-center">
            <AppButton variant="outline" :loading="loadingMore" @click="loadReviews(current + 1)">
              {{ loadingMore ? '加载中…' : '加载更多' }}
            </AppButton>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
