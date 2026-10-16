<script setup lang="ts">
/**
 * 购车券列表。**两种券长得很不一样，不能一把梭渲染**：
 *
 * - `type = 1` 秒杀券有库存与时间窗，是「限时特价」；过期/未开始时它仍在列表里
 *   （后端不筛），但要显示成不可抢 —— 直接隐藏会让用户以为是数据丢了。
 * - `type = 0` 普通券**没有** `stock` / `beginTime` / `endTime`（后端 LEFT JOIN 未命中），
 *   任何对它们的渲染都会是 `undefined`。这里按 `type` 分支，不做「有就显示」的猜测。
 *
 * 空数组整块不渲染 —— 没有券的车不该有一个空标题。
 *
 * 自己管自己的滚动入场，理由见 `SpecTable.vue` 顶部那段：`data-reveal` 只有 CSS 的
 * 「先藏住」，揭开它的 JS 缺了就永久隐形。
 */
import { computed, ref } from 'vue'
import type { Voucher } from '@/api/types'
import { isSeckillLive } from '@/api/car'
import { useReveal } from '@/composables/useReveal'
import { formatCount } from '@/composables/useCountUp'
import AppTag from '../ui/AppTag.vue'

const props = defineProps<{ vouchers: Voucher[] }>()

const root = ref<HTMLElement | null>(null)
useReveal(root, { children: true, stagger: 0.06, y: 30 })

/** 分 → 元。后端 `payValue` / `actualValue` 是 `Long` 分，别直接当元渲染（差 100 倍） */
const yuan = (fen: number) => formatCount(fen / 100, 0)

/** `2026-10-23T14:30:00` → `10/23`。切字符串而不是 `new Date()` —— 后端给的是
 *  naive local datetime，过一遍 Date 只会引进时区问题，而这里只要「几月几号」。 */
const monthDay = (iso: string | null | undefined) => (iso ? iso.slice(5, 10).replace('-', '/') : '')

/**
 * 取一次「现在」，不在模板里反复 `Date.now()`：渲染期间时间在走，
 * 同一个列表里两张券可能落在不同的判据上，而且纯函数每次拿到不同的 now 会让
 * Vue 的模板求值结果不可复现。挂载时定一次就够 —— 页面不会挂着等它过期。
 */
const now = Date.now()

const items = computed(() =>
  props.vouchers.map((v) => {
    const live = isSeckillLive(v, now)
    // 秒杀券三态：可抢 / 未开始 / 已结束。普通券只有一种样子
    const state =
      v.type !== 1 ? '购车券' : live ? '限时' : v.beginTime && now < Date.parse(v.beginTime) ? '未开始' : '已结束'
    return { v, live, state }
  }),
)
</script>

<template>
  <section v-if="items.length" ref="root" class="mx-auto max-w-[1440px] px-8 py-20 lg:px-16 lg:py-24">
    <header data-reveal>
      <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Vouchers</p>
      <h2
        class="mt-4 text-[clamp(1.5rem,2.4vw,2.25rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
      >
        限时特价与购车券
      </h2>
    </header>

    <div class="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2" data-reveal>
      <article
        v-for="{ v, live, state } in items"
        :key="v.id"
        class="flex flex-col rounded-[1.25rem] border p-6 transition-colors duration-500"
        :class="live ? 'border-fg/25 bg-bg-raised' : 'border-line'"
      >
        <div class="flex items-start justify-between gap-4">
          <h3 class="text-[16px] leading-snug font-medium tracking-tight text-fg">{{ v.title }}</h3>
          <!-- 状态用明度区分，不用色相：可抢 = 黑底白字 -->
          <AppTag :tone="live ? 'strong' : 'quiet'">{{ state }}</AppTag>
        </div>

        <p v-if="v.subTitle" class="mt-2 text-[13px] leading-relaxed text-fg-muted">
          {{ v.subTitle }}
        </p>

        <!-- 价格是这张卡的主视觉。`payValue` 为 0 时不写「¥0 抵」—— 0 元券读起来像 bug -->
        <p class="tnum mt-6 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <template v-if="v.payValue > 0">
            <span class="text-[15px] text-fg-muted">¥{{ yuan(v.payValue) }}</span>
            <span class="text-[13px] text-fg-subtle">抵</span>
          </template>
          <span class="text-[32px] leading-none font-semibold tracking-tight text-fg">
            ¥{{ yuan(v.actualValue) }}
          </span>
        </p>

        <!-- 秒杀券专属：库存与截止日。普通券没有这两个字段，整行不出现 -->
        <p
          v-if="v.type === 1"
          class="tnum mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted"
        >
          <span v-if="v.stock != null">剩余 {{ v.stock }} 张</span>
          <span v-if="v.endTime" class="text-fg-subtle">截止 {{ monthDay(v.endTime) }}</span>
        </p>

        <p
          v-if="v.rules"
          class="mt-5 border-t border-line pt-4 text-[12px] leading-[1.9] whitespace-pre-line text-fg-subtle"
        >
          {{ v.rules }}
        </p>
      </article>
    </div>
  </section>
</template>
