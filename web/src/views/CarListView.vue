<script setup lang="ts">
/**
 * 车源列表 `/cars/:brand?`（`:brand` 是**品牌 id**，与 `typeId` 同义）。
 *
 * ── 一个刻意的取舍：没有复用 `FeaturedCars` ────────────────────────────────
 *
 * 计划里写的是复用 `FeaturedCars.vue`，实现时改成了直接渲染 `CarCard`。原因是一个
 * **静默失效**：`FeaturedCars` 内部调 `useReveal(root, { children: true })` 且**不传 `ready`**，
 * 于是它在 `onMounted` 那一刻就跑 —— 而它无论如何都会渲染段落的 `<header data-reveal>`，
 * 所以 `targets.length > 0`，`useReveal` 内部的 `done` 就此置位、**再也不跑**。
 *
 * 后果分两段：首屏那 10 张卡（数据后到，挂载时还不存在）拿不到补间；「加载更多」
 * 追加的卡片同理。而 `main.css` 给 `[data-reveal] { opacity: 0 }` 是无条件的 ——
 * 于是它们**永久隐形，且控制台一片安静**。这正是 `useReveal` 注释里记的那个坑。
 *
 * 所以这一页把 `data-reveal` 放在**整块结果区**上（网格容器、页脚），
 * 而不是放在每张卡片上：
 *
 * - 容器只会 reveal 一次，追加进去的卡片在已经 `opacity: 1` 的容器里，天然可见；
 * - 「谁渲染 `[data-reveal]`，谁负责揭开它」这条不变量仍然成立（本页自己调了 `useReveal`）。
 *
 * ── 分页与 `hasMore` ────────────────────────────────────────────────────
 *
 * 后端不返回 `total`，所以 `hasMore` 靠「这一页满了就算还有」（`deriveHasMore`）。
 * 两个已知的不精确之处，都在界面上说出来了而不是假装没有：
 *
 * 1. 最后一批**恰好凑满 10 条**时会多一次空请求（点一下没反应）。这是没有 total 时
 *    无法避免的。
 * 2. 「附近优先」路径下 `kind` 是在 GEO 取回**之后**才筛的（Redis GEO 没有属性过滤），
 *    所以短页 ≠ 到底。因此开着附近优先时**不说**「没有更多了」。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchBrands, fetchCarsByBrand } from '@/api/car'
import type { Brand, Car, KindFilter } from '@/api/types'
import { useReveal } from '@/composables/useReveal'
import FilterBar from '@/components/business/FilterBar.vue'
import CarCard from '@/components/business/CarCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

const route = useRoute()
const router = useRouter()

const brands = ref<Brand[]>([])
const cars = ref<Car[]>([])
const page = ref(1)
const hasMore = ref(false)
const loaded = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')

const kind = ref<KindFilter>('all')
const nearby = ref(false)
const locating = ref(false)
const coords = ref<{ x: number; y: number } | null>(null)
const notice = ref('')

const pageRoot = ref<HTMLElement | null>(null)
useReveal(pageRoot, { children: true, stagger: 0.08, y: 24, ready: loaded })

/**
 * 筛选状态里**只有品牌**放在 URL 上。品牌是可分享的语义（「宝马的车源」有个像样的链接），
 * 而 `kind` / `nearby` 是这一次浏览的临时视图，塞进 query 只会让 URL 变吵。
 *
 * 反过来说：`brandId` 以路由为**唯一事实来源**，本地不另存一份。两处各存一份必然要写
 * 双向同步，而「点品牌 → 改 state → watch 到变化 → 再 push 路由 → 又 watch 回来」
 * 会多发一次请求（结果一样，只是白跑）。
 */
const brandId = computed<number | null>(() => {
  const raw = route.params.brand
  const s = Array.isArray(raw) ? raw[0] : raw
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
})

const activeBrand = computed(() => brands.value.find((b) => b.id === brandId.value) ?? null)

/**
 * 请求序号。用户连点品牌时会有多个请求在飞，到达顺序**不保证**与发出顺序一致 ——
 * 没有这个守卫，先发的慢请求后到，就会把已经切走的品牌的车源写回界面
 * （看起来像「点了宝马，列表还是别的车」，刷新一下又好了）。
 */
let seq = 0

async function load(mode: 'reset' | 'more'): Promise<void> {
  const mine = ++seq
  const target = mode === 'reset' ? 1 : page.value + 1

  if (mode === 'reset') loading.value = true
  else loadingMore.value = true

  try {
    const res = await fetchCarsByBrand({
      typeId: brandId.value ?? undefined,
      current: target,
      kind: kind.value === 'all' ? undefined : kind.value,
      // 坐标只在**用户真的开着附近优先**时传。`nearby` 与 `coords` 必须同时成立：
      // 只有 coords 意味着上次定位的残留，拿它去排会让「关闭附近优先」不生效。
      ...(nearby.value && coords.value ? { x: coords.value.x, y: coords.value.y } : {}),
    })
    if (mine !== seq) return

    page.value = target
    cars.value = mode === 'reset' ? res.list : [...cars.value, ...res.list]
    hasMore.value = res.hasMore
    error.value = ''
  } catch (err) {
    if (mine !== seq) return
    error.value = err instanceof Error ? err.message : '车源加载失败'
    if (mode === 'reset') cars.value = []
  } finally {
    if (mine === seq) {
      loading.value = false
      loadingMore.value = false
      loaded.value = true
    }
  }
}

/** 品牌走路由，`brandId` 一变下面的 watch 自己会重载 */
function selectBrand(next: number | null): void {
  void router.replace(next === null ? { name: 'cars', params: {} } : { name: 'cars', params: { brand: String(next) } })
}

watch([brandId, kind], () => {
  void load('reset')
})

const GEO_ERRORS: Record<number, string> = {
  1: '定位权限被拒绝',
  2: '暂时拿不到位置',
  3: '定位超时',
}

function enableNearby(): void {
  if (!('geolocation' in navigator)) {
    notice.value = '这个浏览器不支持定位，已按默认顺序显示车源。'
    return
  }

  locating.value = true
  notice.value = ''

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      // ⚠️ `x` = 经度、`y` = 纬度 —— 与后端 `GEOSEARCH` 的参数顺序一致（经度在前）。
      // 两者写反不会报任何错，只会得到一份「附近」里全是远车的列表。
      coords.value = { x: pos.coords.longitude, y: pos.coords.latitude }
      nearby.value = true
      locating.value = false
      void load('reset')
    },
    (err) => {
      // 失败时**明说**没按距离排。静默退回默认顺序会让人以为看的是附近的车。
      const reason = GEO_ERRORS[err.code] ?? '定位失败'
      locating.value = false
      nearby.value = false
      coords.value = null
      notice.value = `${reason}，已按默认顺序显示车源（不是按距离）。`
      void load('reset')
    },
    { timeout: 10_000, maximumAge: 300_000 },
  )
}

function onNearby(next: boolean): void {
  if (next) {
    enableNearby()
    return
  }
  nearby.value = false
  coords.value = null
  notice.value = ''
  void load('reset')
}

onMounted(async () => {
  try {
    brands.value = await fetchBrands()
  } catch {
    // 品牌表拿不到不该挡住车源：筛选栏那一排空着，列表照常出
    brands.value = []
  }
  await load('reset')
})
</script>

<template>
  <div ref="pageRoot">
    <!-- 页面头与筛选栏**不加 `data-reveal`**：它们是操作界面，必须在数据到达前可点可用 -->
    <header class="mx-auto max-w-[1440px] px-8 pt-24 pb-10 lg:px-16 lg:pt-32">
      <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Inventory</p>
      <h1
        class="mt-4 text-[clamp(2rem,4.4vw,3.5rem)] leading-tight font-semibold tracking-[-0.035em] text-fg"
      >
        {{ activeBrand ? activeBrand.name : '全部车源' }}
      </h1>
    </header>

    <FilterBar
      :brands="brands"
      :brand-id="brandId"
      :kind="kind"
      :nearby="nearby"
      :locating="locating"
      :notice="notice"
      @update:brand-id="selectBrand"
      @update:kind="kind = $event"
      @update:nearby="onNearby"
    />

    <!-- 骨架照真实网格构图，加载完不跳 -->
    <div v-if="!loaded" class="mx-auto max-w-[1440px] px-8 py-16 lg:px-16">
      <div class="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 6" :key="i">
          <SkeletonBlock rounded="rounded-[1.25rem]" class="aspect-[4/3]" />
          <SkeletonBlock rounded="rounded-md" class="mt-4 h-4 w-2/3" />
          <SkeletonBlock rounded="rounded-md" class="mt-3 h-6 w-1/3" />
        </div>
      </div>
    </div>

    <template v-else>
      <div data-reveal class="mx-auto max-w-[1440px] px-8 pt-14 pb-16 lg:px-16">
        <!-- 加载失败：与「没有匹配」是两件事，不能都渲染成空态 -->
        <div v-if="error" class="py-16">
          <p class="text-[15px] font-medium text-fg">车源没能加载出来</p>
          <p class="mt-3 max-w-[32rem] text-[14px] leading-[1.9] text-fg-muted">{{ error }}</p>
          <div class="mt-8">
            <AppButton variant="outline" @click="load('reset')">重试</AppButton>
          </div>
        </div>

        <!-- 空态要区分「附近 5 公里内没有」和「这个筛选下没有」—— 两者的下一步不同 -->
        <div v-else-if="cars.length === 0" class="py-16">
          <p class="text-[15px] font-medium text-fg">
            {{ nearby ? '附近 5 公里内没有车源' : '没有符合条件的车源' }}
          </p>
          <p class="mt-3 max-w-[32rem] text-[14px] leading-[1.9] text-fg-muted">
            <template v-if="nearby">
              附近优先只搜 5 公里半径，而车源集中在上海 / 北京 / 深圳 —— 这三城之外的位置必然是空的。
              关掉它就能看到全部。
            </template>
            <template v-else>
              换个品牌或换个大类看看，也可以先看全部车源。
            </template>
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <AppButton v-if="nearby" variant="outline" @click="onNearby(false)">关闭附近优先</AppButton>
            <AppButton v-else-if="brandId !== null" variant="outline" @click="selectBrand(null)">
              查看全部品牌
            </AppButton>
          </div>
        </div>

        <template v-else>
          <div class="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            <CarCard v-for="car in cars" :key="car.id" :car="car" />
          </div>

          <div class="mt-20 flex flex-col items-center gap-4">
            <AppButton
              v-if="hasMore"
              variant="outline"
              size="lg"
              :loading="loadingMore"
              @click="load('more')"
            >
              {{ loadingMore ? '加载中…' : '加载更多' }}
            </AppButton>

            <p v-else class="text-[13px] leading-relaxed text-fg-muted">
              <template v-if="nearby">
                附近优先只列 5 公里内的车源，更远的不在此列 —— 关掉它可以看到全部。
              </template>
              <template v-else> 已经到底了。 </template>
            </p>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
