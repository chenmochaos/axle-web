<script setup lang="ts">
/**
 * 车辆详情页 `/car/:id`。骨架：取参 → 加载 → 骨架屏 / 空态 / 内容。
 *
 * ── 三类数据的加载顺序 ────────────────────────────────────────────
 *
 * 车辆本体必须先到（没有它连 `shopId` 都不知道），券与相似车源都依赖它，
 * 所以是「先 1 后 2」两段，第二段两者 `Promise.all` 并行。
 * 不把三个请求堆成一次 `Promise.all`，是因为后两个的入参就是第一个的结果 ——
 * 硬写成一次只能靠假 id 先发请求。
 *
 * ── 为什么这个视图自己拿 `useReveal` ──────────────────────────────
 *
 * 项目的约定是「谁渲染 `[data-reveal]`，谁负责揭开它」：SpecTable / VoucherCards /
 * FeaturedCars 各自内部调 `useReveal`，本视图不去插手它们的子元素。
 * 唯一的例外是下面那块「车源所在地」—— 它是本文件内联的，所以由本视图负责。
 * 两个宿主叠在同一个元素上不会报错，但会抖。
 *
 * ── 不做 `route.params.id` 的 watch ──────────────────────────────
 *
 * `App.vue` 的 `<RouterView>` 用 `:key="route.path"`，`/car/5` → `/car/12`
 * 会整块重挂，`onMounted` 自然重跑。加一个 watch 反而会有两个加载入口。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  fetchCarDetail,
  fetchSimilarCars,
  fetchVouchersOfShop,
  isSeckillLive,
  kindOf,
} from '@/api/car'
import type { Car, Voucher } from '@/api/types'
import { forgetFlipSource } from '@/lib/flip'
import { refreshScrollTriggers, useReveal } from '@/composables/useReveal'
import CarHero from '@/components/business/CarHero.vue'
import SpecTable from '@/components/business/SpecTable.vue'
import VoucherCards from '@/components/business/VoucherCards.vue'
import FeaturedCars from '@/components/business/FeaturedCars.vue'
import StickyBuyBar from '@/components/business/StickyBuyBar.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import AppButton from '@/components/ui/AppButton.vue'

const route = useRoute()

const car = ref<Car | null>(null)
const vouchers = ref<Voucher[]>([])
const similar = ref<Car[]>([])
const loaded = ref(false)

/** 本视图内联区块的 reveal 宿主（只含「车源所在地」那一块） */
const dealer = ref<HTMLElement | null>(null)
useReveal(dealer, { children: true, stagger: 0.1, y: 26, ready: loaded })

const kindLabel = computed(() => (car.value && kindOf(car.value) === 'motorcycle' ? '摩托车' : '汽车'))

/**
 * 参数表。**「缺字段就不出这一行」是这一页最重要的一条规则**：
 * 真机路径今天拿不到里程/变速箱/能源（后端没有这些列，见 CLAUDE.md），
 * 渲染成 `undefined` 或补个 `—` 都是在假装数据存在。
 * 行由这里拼好再交给 `SpecTable` —— 展示组件不该知道车辆字段长什么样。
 *
 * ── 只放「这台车是什么」 ──────────────────────────────────────────
 *
 * 车况评分、已咨询 归首屏（那是看点，不是规格）；
 * 所在地、距我 归下面的「车源所在地」区块（同一个值在一页上出现两次很廉价）。
 * 之前这四行都在表里，于是和首屏/门店块逐字重复了一遍。
 */
const specRows = computed(() => {
  const c = car.value
  if (!c) return []
  const rows: ({ label: string; value: string } | null)[] = [
    { label: '车款', value: c.name },
    { label: '品牌', value: c.brand },
    { label: '类别', value: kindLabel.value },
    c.mileage != null ? { label: '表显里程', value: `${c.mileage} 万公里` } : null,
    c.registerDate ? { label: '上牌时间', value: c.registerDate } : null,
    c.gearbox ? { label: '变速箱', value: c.gearbox } : null,
    c.fuel ? { label: '能源类型', value: c.fuel } : null,
    c.displacement ? { label: '排量', value: c.displacement } : null,
    c.ownerCount != null
      ? { label: '过户次数', value: c.ownerCount === 0 ? '一手车，未过户' : `${c.ownerCount} 次` }
      : null,
  ]
  return rows.filter((r): r is { label: string; value: string } => r !== null)
})

/** 底部操作条的开关：**只认「此刻可抢」的秒杀券**，未开始/已结束都不算 */
const liveSeckill = computed(() => vouchers.value.find((v) => isSeckillLive(v)))

const hasDealer = computed(() => Boolean(car.value?.address) || car.value?.distance != null)

onMounted(async () => {
  const id = Number(route.params.id)

  if (!Number.isFinite(id)) {
    // 记下的矩形属于「另一台车」，留着只会等下一次误匹配
    forgetFlipSource()
    loaded.value = true
    return
  }

  const found = await fetchCarDetail(id)
  car.value = found ?? null

  if (found) {
    const [vs, sim] = await Promise.all([fetchVouchersOfShop(found.id), fetchSimilarCars(found)])
    vouchers.value = vs
    similar.value = sim
  } else {
    forgetFlipSource()
  }

  loaded.value = true

  // 内容整块是 v-if 出来的，且 hero 大图会撑高页面 —— 都要让 ScrollTrigger 重算触发点。
  // `nextTick` 之后刷一次不够：图片 onload 时布局还在变，所以再挂一次 window load。
  await nextTick()
  refreshScrollTriggers()
  window.addEventListener('load', refreshScrollTriggers, { once: true })
})
</script>

<template>
  <!-- 单根 wrapper 是为了 <Transition>：多根节点组件不能直接做转场目标 -->
  <div>
    <!-- 骨架屏沿用 hero 的两栏构图，加载完不会「跳一下」才变成真内容 -->
    <div v-if="!loaded" class="pt-[4.5rem]">
      <div class="mx-auto max-w-[1440px] px-8 pt-8 pb-4 lg:px-16 lg:pt-12">
        <div class="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <SkeletonBlock rounded="rounded-[1.5rem]" class="aspect-[4/3]" />
          <div class="space-y-5">
            <SkeletonBlock rounded="rounded-md" class="h-3 w-28" />
            <SkeletonBlock rounded="rounded-md" class="h-12 w-4/5" />
            <SkeletonBlock rounded="rounded-md" class="h-10 w-1/2" />
            <SkeletonBlock rounded="rounded-md" class="h-6 w-2/3" />
          </div>
        </div>
      </div>
    </div>

    <section
      v-else-if="!car"
      class="mx-auto flex min-h-[70svh] max-w-[1440px] flex-col justify-center px-8 lg:px-16"
    >
      <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Not found</p>
      <h1
        class="mt-5 text-[clamp(1.75rem,4vw,2.75rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
      >
        没有找到这台车
      </h1>
      <p class="mt-5 max-w-[30rem] text-[14px] leading-[1.9] text-fg-muted">
        它可能已经售出或下架了。
      </p>
      <div class="mt-9">
        <AppButton to="/cars">看看其他车源</AppButton>
      </div>
    </section>

    <div v-else>
      <CarHero :car="car" />

      <SpecTable :rows="specRows" eyebrow="Specification" title="车辆参数" />

      <VoucherCards v-if="vouchers.length" :vouchers="vouchers" />

      <!-- 车源所在地。没有地图选点（没引地图库），只把地址与距离摆清楚 ——
           这台车在哪、离我多远，是决定「要不要跑一趟」的全部信息 -->
      <section
        v-if="hasDealer"
        ref="dealer"
        class="mx-auto max-w-[1440px] px-8 py-20 lg:px-16 lg:py-24"
      >
        <header data-reveal>
          <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Dealer</p>
          <h2
            class="mt-4 text-[clamp(1.5rem,2.4vw,2.25rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
          >
            车源所在地
          </h2>
        </header>

        <dl class="mt-12 border-t border-line" data-reveal>
          <div
            v-if="car.address"
            class="flex items-baseline justify-between gap-6 border-b border-line py-4"
          >
            <dt class="shrink-0 text-[13px] text-fg-muted">地址</dt>
            <dd class="text-right text-[14px] font-medium text-fg">{{ car.address }}</dd>
          </div>
          <div
            v-if="car.distance != null"
            class="flex items-baseline justify-between gap-6 border-b border-line py-4"
          >
            <dt class="shrink-0 text-[13px] text-fg-muted">距我</dt>
            <dd class="tnum text-right text-[14px] font-medium text-fg">
              {{ car.distance }} km
            </dd>
          </div>
        </dl>
      </section>

      <!-- 相似车源复用首页的卡片区块。`anchor` 传 null 是必要的：
           它的默认值是 `featured`，详情页再来一个同 id 的元素会让首页的锚点跳转有歧义 -->
      <FeaturedCars
        v-if="similar.length"
        :cars="similar"
        eyebrow="Similar"
        title="相似车源"
        more-to="/cars"
        more-label="浏览全部车源"
        :anchor="null"
      />

      <!-- 只在有可抢的秒杀券时出现。无券 → 整条不渲染，不留一个点不动的按钮 -->
      <StickyBuyBar v-if="liveSeckill" :voucher="liveSeckill" />
    </div>
  </div>
</template>
