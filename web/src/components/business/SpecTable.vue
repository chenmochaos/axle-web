<script setup lang="ts">
/**
 * 参数表。只负责排版，**不知道车辆字段长什么样** —— 行由调用方拼好，
 * 因为「哪些行该出现」是业务判断（缺字段就不出这一行），混进展示组件里会变成
 * 一堆 `v-if` 加猜测。
 *
 * 空数组整块不渲染：没有数据就不要一个空标题挂在那里。
 *
 * 两列是 `justify-between` 的 label/value，不是等宽表格 —— 值长短差异很大
 * （「2020-05」vs「广东省深圳市南山区科苑南路 2666 号」），等宽列会让短值旁边留一大片空白。
 *
 * 自己管自己的滚动入场：`data-reveal` 只是「首屏前先藏住」的 CSS 钩子
 * （main.css 给 `opacity: 0`），**必须有 JS 去揭开它**。少了 `useReveal`，
 * 这块内容就是永久隐形的 —— 而且 `prefers-reduced-motion` 下 main.css 的兜底
 * 会把它显示出来，于是只测减弱动效永远发现不了。`useReveal.spec.ts` 在守这条配对。
 */
import { ref } from 'vue'
import { useReveal } from '@/composables/useReveal'

defineProps<{
  /** 空数组 → 整块不渲染 */
  rows: { label: string; value: string }[]
  title: string
  eyebrow?: string
}>()

const root = ref<HTMLElement | null>(null)
useReveal(root, { children: true, stagger: 0.06, y: 30 })
</script>

<template>
  <section v-if="rows.length" ref="root" class="mx-auto max-w-[1440px] px-8 py-20 lg:px-16 lg:py-24">
    <header data-reveal>
      <p
        v-if="eyebrow"
        class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase"
      >
        {{ eyebrow }}
      </p>
      <h2
        class="mt-4 text-[clamp(1.5rem,2.4vw,2.25rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
      >
        {{ title }}
      </h2>
    </header>

    <dl
      class="mt-12 grid grid-cols-1 gap-x-16 border-t border-line sm:grid-cols-2"
      data-reveal
    >
      <div
        v-for="row in rows"
        :key="row.label"
        class="flex items-baseline justify-between gap-6 border-b border-line py-4"
      >
        <dt class="shrink-0 text-[13px] text-fg-muted">{{ row.label }}</dt>
        <dd class="tnum text-right text-[14px] font-medium text-fg">{{ row.value }}</dd>
      </div>
    </dl>
  </section>
</template>
