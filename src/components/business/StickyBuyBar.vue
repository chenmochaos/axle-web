<script setup lang="ts">
/**
 * 底部操作条。**只在有可抢的秒杀券时出现** —— 详情页上唯一的行动点。
 *
 * 为什么没有「预约看车」：后端没有预约接口。做一个点下去没反应的按钮，
 * 比没有这个按钮更糟 —— 那是界面在演一个不存在的功能。
 *
 * 为什么是 `sticky` 而不是 `fixed`：
 *
 * 1. `fixed` 会一直挂在视口底部，滚到页脚时还压在那里，看起来像页脚上面贴了块补丁。
 *    `sticky bottom-0` 被**父元素**夹住，详情页滚完就自然归位。
 * 2. `fixed` 要自己给页面留出等高的空隙（否则遮住最后一块内容），而 `sticky`
 *    在正常流里占位，空隙是白送的。
 * 3. header 也是 `fixed`（z-50），两个 fixed 元素在层叠上要额外协商；sticky 只需 z-30。
 */
import type { Voucher } from '@/api/types'
import { formatCount } from '@/composables/useCountUp'
import AppButton from '../ui/AppButton.vue'

defineProps<{ voucher: Voucher }>()

const yuan = (fen: number) => formatCount(fen / 100, 0)

/** 与 `VoucherCards` 同一个理由：后端是 naive local datetime，切字符串最省事 */
const monthDay = (iso: string | null | undefined) => (iso ? iso.slice(5, 10).replace('-', '/') : '')
</script>

<template>
  <div class="pointer-events-none sticky bottom-0 z-30 pt-6 pb-5">
    <div class="mx-auto max-w-[1440px] px-8 lg:px-16">
      <div
        class="pointer-events-auto flex items-center gap-5 rounded-[1.5rem] border border-line bg-bg/85 p-3 pl-6 shadow-[var(--shadow-key)] backdrop-blur-xl"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-[14px] font-medium tracking-tight text-fg">{{ voucher.title }}</p>
          <p class="tnum mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-fg-muted">
            <span v-if="voucher.stock != null">剩余 {{ voucher.stock }} 张</span>
            <span v-if="voucher.endTime" class="text-fg-subtle">
              截止 {{ monthDay(voucher.endTime) }}
            </span>
          </p>
        </div>

        <p class="tnum hidden items-baseline gap-1.5 sm:flex">
          <span class="text-[12px] text-fg-subtle">¥{{ yuan(voucher.payValue) }} 抵</span>
          <span class="text-[20px] leading-none font-semibold tracking-tight text-fg">
            ¥{{ yuan(voucher.actualValue) }}
          </span>
        </p>

        <AppButton :to="`/seckill/${voucher.id}`">立即抢购</AppButton>
      </div>
    </div>
  </div>
</template>
