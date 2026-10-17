<script setup lang="ts">
/**
 * 列表页筛选栏：大类 tab + 品牌 + 「附近优先」。
 *
 * ── 这里**故意没有**价格/里程排序 ───────────────────────────────────────
 *
 * 后端的 `/car/list` 只认 `typeId` / `current` / `kind` / `x` / `y`，没有任何排序参数。
 * 想排就只能拿「已加载的那 10 条」在客户端排 —— 用户会把排序结果读成「全站最便宜」，
 * 而在真机分页下那个结论是错的：第 2 页可能有一台便宜得多的车。
 * 一个会骗人的控件比没有这个控件更糟，所以宁可不做。
 *
 * ── 定位失败不静默降级 ──────────────────────────────────────────────────
 *
 * `notice` 由 `CarListView` 传入，专门用来把「没按距离排」这件事说出来。
 * 静默退回默认顺序的话，界面看起来完全正常，用户却以为看到的是「附近的车」——
 * 这是最坑的一种失败，因为它没有任何症状。
 *
 * ⚠️ 本组件**不加 `data-reveal`**：它是操作界面，必须在数据到达前就可点，
 * 挂上 `data-reveal` 会被 `useReveal(ready: loaded)` 拖到加载之后才现身。
 */
import type { Brand, KindFilter } from '@/api/types'
import KindTabs from './KindTabs.vue'

defineProps<{
  brands: Brand[]
  brandId: number | null
  kind: KindFilter
  nearby: boolean
  locating: boolean
  /** 定位相关的说明文案。**空串表示没有要说的**，此时整行不渲染 */
  notice: string
}>()

const emit = defineEmits<{
  'update:brandId': [number | null]
  'update:kind': [KindFilter]
  'update:nearby': [boolean]
}>()
</script>

<template>
  <div>
    <!-- 大类：本行回答「看什么车」，是品牌那一行的父级 -->
    <KindTabs :model-value="kind" @update:model-value="emit('update:kind', $event)" />

    <div
      class="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-10 gap-y-4 px-8 py-5 lg:px-16"
    >
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-3" role="group" aria-label="品牌">
        <button
          type="button"
          :aria-pressed="brandId === null"
          class="relative py-1 text-[13px] font-medium tracking-wide transition-colors duration-500 ease-[var(--ease-cinematic)]"
          :class="brandId === null ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted'"
          @click="emit('update:brandId', null)"
        >
          全部品牌
          <span
            class="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-fg transition-transform duration-500 ease-[var(--ease-cinematic)]"
            :class="brandId === null ? 'scale-x-100' : 'scale-x-0'"
          />
        </button>

        <button
          v-for="brand in brands"
          :key="brand.id"
          type="button"
          :aria-pressed="brandId === brand.id"
          class="relative py-1 text-[13px] font-medium tracking-wide transition-colors duration-500 ease-[var(--ease-cinematic)]"
          :class="brandId === brand.id ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted'"
          @click="emit('update:brandId', brand.id)"
        >
          {{ brand.name }}
          <span
            class="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-fg transition-transform duration-500 ease-[var(--ease-cinematic)]"
            :class="brandId === brand.id ? 'scale-x-100' : 'scale-x-0'"
          />
        </button>
      </div>

      <!-- 开关而不是 checkbox：它触发一次定位，不是提交表单的一部分 -->
      <button
        type="button"
        :aria-pressed="nearby"
        :disabled="locating"
        class="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-colors duration-500 ease-[var(--ease-cinematic)] disabled:opacity-50"
        :class="
          nearby
            ? 'border-fg text-fg'
            : 'border-line text-fg-muted hover:border-fg-subtle hover:text-fg'
        "
        @click="emit('update:nearby', !nearby)"
      >
        <span class="h-1.5 w-1.5 rounded-full" :class="nearby ? 'bg-fg' : 'bg-fg-subtle'" />
        {{ locating ? '定位中…' : '附近优先' }}
      </button>
    </div>

    <p
      v-if="notice"
      class="mx-auto max-w-[1440px] px-8 pb-6 text-[13px] leading-relaxed text-fg-muted lg:px-16"
      role="status"
    >
      <span aria-hidden="true">—&nbsp;</span>{{ notice }}
    </p>
  </div>
</template>
