<script setup lang="ts">
/**
 * 个人中心 `/me`。需要登录。
 *
 * ── 签到状态怎么读 ──────────────────────────────────────────────────────
 *
 * `GET /user/sign/count` 返回的是「从今天往前连续签到的天数」。由此可以推出一件事：
 *
 * * `count > 0` ⟺ **今天已经签过**（后端从今天那一位开始数，今天没签就是 0）
 * * `count = 0` ⟹ 今天没签（昨天签没签，这个接口不告诉你）
 *
 * 所以「今日已签到」用 `count > 0` 判断是准确的；但**不能**用它判断「本月签了几天」——
 * 中间断一次，前面的记录就不在计数里了。界面上只展示连续天数，不展示「本月累计」，
 * 因为后端没有给出后者。
 *
 * ── 登出之后回哪 ────────────────────────────────────────────────────────
 *
 * 回首页而不是留在 `/me`：这是登录页，登出后本页会立刻触发跳登录，
 * 用户会看到「点了登出 → 被要求登录」这种莫名其妙的一跳。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NeedLoginError } from '@/api/client'
import { fetchMyReviews } from '@/api/review'
import { fetchProfile } from '@/api/social'
import { fetchSignCount, signIn } from '@/api/user'
import type { Review, UserProfile } from '@/api/types'
import { useRequireLogin } from '@/composables/useRequireLogin'
import { useReveal } from '@/composables/useReveal'
import ReviewCard from '@/components/business/ReviewCard.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import AppButton from '@/components/ui/AppButton.vue'

const router = useRouter()
const route = useRoute()
const { ensure, auth } = useRequireLogin()

const profile = ref<UserProfile | null>(null)
const signCount = ref(0)
const reviews = ref<Review[]>([])
const current = ref(1)
const hasMore = ref(false)
const loadingMore = ref(false)

const loaded = ref(false)
const signing = ref(false)
const loggingOut = ref(false)
const error = ref('')

const pageRoot = ref<HTMLElement | null>(null)
useReveal(pageRoot, { children: true, stagger: 0.09, y: 26, ready: loaded })

const initial = computed(() => profile.value?.nickName.slice(0, 1) ?? '')
/** `count > 0` ⟺ 今天已签 —— 推导见文件头 */
const signedToday = computed(() => signCount.value > 0)

async function reload(): Promise<void> {
  const user = auth.user
  if (!user) return
  const [p, count, page] = await Promise.all([
    fetchProfile(user.id),
    fetchSignCount(),
    fetchMyReviews(1),
  ])
  profile.value = p
  signCount.value = count
  reviews.value = page.list
  hasMore.value = page.hasMore
}

onMounted(async () => {
  if (!(await ensure())) {
    loaded.value = true
    return
  }
  try {
    await reload()
  } catch (err) {
    if (err instanceof NeedLoginError) {
      await router.push({ name: 'login', query: { next: route.fullPath } })
      return
    }
    error.value = err instanceof Error ? err.message : '加载失败，请稍后重试'
  } finally {
    loaded.value = true
  }
})

async function onSign(): Promise<void> {
  if (signing.value || signedToday.value) return
  signing.value = true
  error.value = ''
  try {
    await signIn()
    // 签到接口返回空 data，连续天数得重新问一次 —— 不能本地 +1：
    // 昨天断了的话，今天的连续天数是 1 而不是旧值 +1。
    signCount.value = await fetchSignCount()
  } catch (err) {
    if (err instanceof NeedLoginError) {
      await router.push({ name: 'login', query: { next: route.fullPath } })
      return
    }
    error.value = err instanceof Error ? err.message : '签到失败，请稍后重试'
  } finally {
    signing.value = false
  }
}

async function onLogout(): Promise<void> {
  loggingOut.value = true
  try {
    await auth.logout()
    await router.replace('/')
  } finally {
    loggingOut.value = false
  }
}

async function loadMoreReviews(): Promise<void> {
  loadingMore.value = true
  try {
    const page = await fetchMyReviews(current.value + 1)
    const known = new Set(reviews.value.map((r) => r.id))
    reviews.value = [...reviews.value, ...page.list.filter((r) => !known.has(r.id))]
    current.value += 1
    hasMore.value = page.hasMore
  } finally {
    loadingMore.value = false
  }
}
</script>

<template>
  <div ref="pageRoot" class="pt-[4.5rem]">
    <div v-if="!loaded" class="mx-auto max-w-[1440px] px-8 py-16 lg:px-16 lg:py-24">
      <div class="flex items-center gap-6">
        <SkeletonBlock rounded="rounded-full" class="h-20 w-20" />
        <div class="space-y-3">
          <SkeletonBlock rounded="rounded-md" class="h-7 w-40" />
          <SkeletonBlock rounded="rounded-md" class="h-3 w-32" />
        </div>
      </div>
      <div class="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonBlock v-for="n in 3" :key="n" rounded="rounded-[1.25rem]" class="aspect-[4/3]" />
      </div>
    </div>

    <template v-else>
      <section class="mx-auto max-w-[1440px] px-8 pt-16 pb-12 lg:px-16 lg:pt-24">
        <div class="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between" data-reveal>
          <div class="flex items-center gap-6">
            <img
              v-if="profile?.icon"
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
                Account
              </p>
              <h1
                class="mt-2 text-[clamp(1.5rem,3vw,2.25rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
              >
                {{ profile?.nickName ?? auth.user?.nickName }}
              </h1>
              <p v-if="profile" class="mt-2 text-[12px] text-fg-subtle tabular-nums">
                {{ profile.fans }} 粉丝 · 关注 {{ profile.followee }} · {{ profile.reviews }} 篇口碑
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <AppButton variant="outline" size="sm" to="/me/edit">编辑资料</AppButton>
            <AppButton
              variant="ghost"
              size="sm"
              :loading="loggingOut"
              @click="onLogout"
            >
              退出登录
            </AppButton>
          </div>
        </div>

        <!-- 签到 -->
        <div
          class="mt-12 flex flex-col gap-5 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between"
          data-reveal
        >
          <div>
            <p class="text-[11px] tracking-[0.18em] text-fg-subtle uppercase">Daily check-in</p>
            <p class="mt-2 text-[14px] text-fg">
              <template v-if="signedToday">
                今天已签到，已连续 <span class="tnum font-semibold">{{ signCount }}</span> 天
              </template>
              <template v-else>今天还没有签到</template>
            </p>
            <p class="mt-1 text-[12px] text-fg-subtle">
              签到记录按自然月统计，连续签到天数从今天往前算。
            </p>
          </div>

          <AppButton
            :variant="signedToday ? 'outline' : 'solid'"
            :disabled="signedToday"
            :loading="signing"
            @click="onSign"
          >
            {{ signedToday ? '今日已签到' : '签到' }}
          </AppButton>
        </div>

        <p v-if="error" class="mt-6 text-[13px] text-fg" role="alert" data-reveal>
          <span aria-hidden="true">—&nbsp;</span>{{ error }}
        </p>
      </section>

      <section class="mx-auto max-w-[1440px] px-8 pb-24 lg:px-16 lg:pb-32">
        <div class="flex items-center justify-between border-t border-line pt-8" data-reveal>
          <p class="text-[11px] tracking-[0.18em] text-fg-subtle uppercase">My reviews</p>
          <AppButton variant="ghost" size="sm" to="/review/edit">写口碑</AppButton>
        </div>

        <div
          v-if="reviews.length === 0"
          class="py-16 text-center"
          data-reveal
        >
          <p class="text-[14px] text-fg-muted">你还没有发布过口碑。</p>
          <div class="mt-8 flex justify-center">
            <AppButton to="/review/edit">写第一篇</AppButton>
          </div>
        </div>

        <template v-else>
          <div class="mt-10 grid grid-cols-1 gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            <ReviewCard v-for="review in reviews" :key="review.id" :review="review" />
          </div>

          <div v-if="hasMore" class="mt-16 flex justify-center">
            <AppButton variant="outline" :loading="loadingMore" @click="loadMoreReviews">
              {{ loadingMore ? '加载中…' : '加载更多' }}
            </AppButton>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
