<script setup lang="ts">
/**
 * 口碑详情 `/review/:id`。公开页：未登录也能读，点赞与关注才要求登录。
 *
 * ── 点赞后为什么重新拉一次详情 ──────────────────────────────────────────
 *
 * `PUT /review/like/{id}` 返回的是空 data（后端 `Result.ok()`），既有计数也不回传新状态。
 * 本地翻转 `isLiked` 能让按钮立刻响应，但**计数以服务端为准**更可靠：
 * 别人同时点赞时，本地 `+1` 会和真实值慢慢漂开，而这种漂移永远没人报 bug。
 * 所以这里等接口成功后再取一次详情 —— 代价是一次请求，换掉一整类静默不一致。
 *
 * ── 点赞榜只有前 5 ─────────────────────────────────────────────────────
 *
 * 后端 `queryReviewLikesById` 用 `range(0, 4)` 取 ZSET 前 5 名。不要在这里写「共 N 人」
 * —— 接口给不出总数，ZSET 里只存点赞人的 id，没有计数。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { NeedLoginError } from '@/api/client'
import { fetchCarDetail } from '@/api/car'
import { fetchReviewDetail, fetchReviewLikers, toggleReviewLike } from '@/api/review'
import type { Car, Review, User } from '@/api/types'
import { useReveal } from '@/composables/useReveal'
import { monthDay } from '@/lib/time'
import { useAuthStore } from '@/stores/auth'
import FollowButton from '@/components/business/FollowButton.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import AppButton from '@/components/ui/AppButton.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const review = ref<Review | null>(null)
const likers = ref<User[]>([])
const car = ref<Car | null>(null)
const loaded = ref(false)
const liking = ref(false)
const likeError = ref('')

const pageRoot = ref<HTMLElement | null>(null)
useReveal(pageRoot, { children: true, stagger: 0.09, y: 26, ready: loaded })

const isSelf = computed(() => auth.user?.id === review.value?.author.id)

const priceWan = computed(() =>
  car.value ? (car.value.price / 10_000).toFixed(1) : '',
)

async function refresh(): Promise<void> {
  const id = Number(route.params.id)
  if (!Number.isFinite(id)) {
    loaded.value = true
    return
  }

  const found = await fetchReviewDetail(id)
  review.value = found ?? null

  if (found) {
    const [top, linked] = await Promise.all([
      fetchReviewLikers(found.id),
      // 车源可能已售出/下架 —— 那只是少一个区块，不该让整篇口碑打不开
      fetchCarDetail(found.carId).catch(() => undefined),
    ])
    likers.value = top
    car.value = linked ?? null
  }

  loaded.value = true
  await nextTick()
}

onMounted(() => void refresh())

async function onLike(): Promise<void> {
  const target = review.value
  if (!target) return
  likeError.value = ''

  liking.value = true
  try {
    await toggleReviewLike(target.id)
    const [fresh, top] = await Promise.all([
      fetchReviewDetail(target.id),
      fetchReviewLikers(target.id),
    ])
    if (fresh) review.value = fresh
    likers.value = top
  } catch (err) {
    if (err instanceof NeedLoginError) {
      await router.push({ name: 'login', query: { next: route.fullPath } })
      return
    }
    likeError.value = err instanceof Error ? err.message : '操作失败，请稍后重试'
  } finally {
    liking.value = false
  }
}
</script>

<template>
  <div ref="pageRoot" class="pt-[4.5rem]">
    <div v-if="!loaded" class="mx-auto max-w-[52rem] px-8 py-16 lg:px-16 lg:py-24">
      <SkeletonBlock rounded="rounded-md" class="h-3 w-24" />
      <SkeletonBlock rounded="rounded-lg" class="mt-6 h-12 w-5/6" />
      <SkeletonBlock rounded="rounded-md" class="mt-4 h-4 w-40" />
      <SkeletonBlock rounded="rounded-[1.25rem]" class="mt-10 aspect-[16/9]" />
      <div class="mt-10 space-y-3">
        <SkeletonBlock v-for="n in 5" :key="n" rounded="rounded-md" class="h-4" />
      </div>
    </div>

    <section
      v-else-if="!review"
      class="mx-auto flex min-h-[70svh] max-w-[1440px] flex-col justify-center px-8 lg:px-16"
    >
      <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Not found</p>
      <h1
        class="mt-5 text-[clamp(1.75rem,4vw,2.75rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
      >
        这篇口碑不存在
      </h1>
      <p class="mt-5 max-w-[30rem] text-[14px] leading-[1.9] text-fg-muted">
        它可能已被作者删除，或者链接里的编号不对。
      </p>
      <div class="mt-9">
        <AppButton to="/review">回到口碑广场</AppButton>
      </div>
    </section>

    <template v-else>
      <article class="mx-auto max-w-[52rem] px-8 pt-16 pb-10 lg:px-16 lg:pt-24">
        <RouterLink
          to="/review"
          class="text-[12px] text-fg-subtle transition-colors duration-300 hover:text-fg"
          data-reveal
        >
          ← 口碑广场
        </RouterLink>

        <header class="mt-8" data-reveal>
          <h1
            class="text-[clamp(1.75rem,3.6vw,2.75rem)] leading-[1.15] font-semibold tracking-[-0.03em] text-pretty text-fg"
          >
            {{ review.title }}
          </h1>

          <div class="mt-7 flex flex-wrap items-center justify-between gap-5">
            <div class="flex items-center gap-3">
              <RouterLink
                :to="`/dealer/${review.author.id}`"
                class="flex items-center gap-3 transition-opacity duration-300 hover:opacity-70"
              >
                <img
                  v-if="review.author.icon"
                  :src="review.author.icon"
                  alt=""
                  class="h-9 w-9 rounded-full object-cover"
                />
                <span
                  v-else
                  class="grid h-9 w-9 place-items-center rounded-full border border-line text-[13px] font-medium text-fg"
                >
                  {{ review.author.nickName.slice(0, 1) }}
                </span>
                <span class="text-[13px] font-medium text-fg-muted">
                  {{ review.author.nickName || '已注销用户' }}
                </span>
              </RouterLink>

              <span class="text-[12px] text-fg-subtle">·</span>
              <span class="tnum text-[12px] text-fg-subtle">
                {{ monthDay(review.createTime) }}
              </span>
            </div>

            <FollowButton
              v-if="!isSelf"
              :user-id="review.author.id"
              size="sm"
            />
          </div>
        </header>

        <!-- 图集：一张大图，多张走两列。与卡片不同，这里不裁成统一比例 ——
             口碑配图是内容本身，强行统一构图会把细节裁掉 -->
        <div v-if="review.images.length" class="mt-12 space-y-4" data-reveal>
          <img
            v-for="(src, i) in review.images"
            :key="src"
            :src="src"
            :alt="`${review.title} 配图 ${i + 1}`"
            class="w-full rounded-[1.25rem] bg-bg-raised object-cover"
            loading="lazy"
          />
        </div>

        <p
          class="mt-12 text-[15px] leading-[2] whitespace-pre-line text-pretty text-fg-muted"
          data-reveal
        >
          {{ review.content }}
        </p>

        <!-- 点赞：按钮 + 点赞榜。榜只在前 5 名存在时渲染 -->
        <div class="mt-14 border-t border-line pt-8" data-reveal>
          <div class="flex items-center gap-4">
            <AppButton
              :variant="review.isLiked ? 'solid' : 'outline'"
              :loading="liking"
              @click="onLike"
            >
              {{ review.isLiked ? '已点赞' : '点赞' }}
              <span class="tnum ml-1 opacity-70">{{ review.liked }}</span>
            </AppButton>
            <span class="text-[12px] text-fg-subtle">评论 {{ review.comments }}</span>
          </div>

          <p v-if="likeError" class="mt-3 text-[12px] text-fg" role="alert">
            <span aria-hidden="true">—&nbsp;</span>{{ likeError }}
          </p>

          <div v-if="likers.length" class="mt-8">
            <p class="text-[11px] tracking-[0.18em] text-fg-subtle uppercase">Liked by</p>
            <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              <RouterLink
                v-for="user in likers"
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
        </div>
      </article>

      <!-- 关联车源。这是口碑最有用的落点：「他在说哪台车」 -->
      <section v-if="car" class="mx-auto max-w-[52rem] px-8 pb-24 lg:px-16 lg:pb-32">
        <RouterLink
          :to="`/car/${car.id}`"
          class="group flex items-center gap-6 border-t border-line pt-8"
          data-reveal
        >
          <div class="h-[92px] w-[136px] shrink-0 overflow-hidden rounded-xl bg-bg-raised">
            <img
              v-if="car.images[0]"
              :src="car.images[0]"
              :alt="car.name"
              loading="lazy"
              class="h-full w-full object-cover transition-transform duration-[1200ms] ease-[var(--ease-cinematic)] group-hover:scale-[1.06]"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-[11px] tracking-[0.18em] text-fg-subtle uppercase">Mentioned car</p>
            <h2 class="mt-2 truncate text-[17px] font-semibold tracking-[-0.02em] text-fg">
              {{ car.name }}
            </h2>
            <p class="mt-1 text-[13px] text-fg-muted">{{ car.brand }}</p>
          </div>
          <p class="shrink-0 text-right">
            <span class="font-display text-[22px] tracking-tight text-fg">{{ priceWan }}</span>
            <span class="ml-1 text-[12px] text-fg-muted">万</span>
          </p>
        </RouterLink>
      </section>
    </template>
  </div>
</template>
