<script setup lang="ts">
import type { KindFilter } from '@/api/types'

/**
 * 车辆大类切换（全部 / 汽车 / 摩托）。
 *
 * 放在品牌导航**上方**：品牌导航回答「去哪家店」，这一行回答「看什么车」，
 * 后者是前者的父级 —— 切到摩托，下面那排品牌里没有摩托的会整块撤掉（见 HomeView）。
 * 反过来摆的话，用户会以为大类是品牌内部的二级筛选。
 *
 * 不用 `<select>`：三个选项不值得藏进弹层，而且下拉在零彩色的排版体系里太像一个表单控件。
 * 选中态靠一条实线而非颜色，跟全站「明度反转做强调」的规矩一致。
 */
const OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'car', label: '汽车' },
  { value: 'motorcycle', label: '摩托' },
]

defineProps<{ modelValue: KindFilter }>()
defineEmits<{ 'update:modelValue': [KindFilter] }>()
</script>

<template>
  <!-- 上边框由本组件提供（它是内容区的第一行），下边框归 BrandNav —— 两条挨着的横线会把
       「切大类」和「选品牌」读成两个不相干的区块，它们其实是一个。 -->
  <div class="border-t border-line">
    <div
      class="mx-auto flex max-w-[1440px] items-center gap-7 px-8 py-5 lg:gap-9 lg:px-16"
      role="group"
      aria-label="车辆大类"
    >
      <button
        v-for="option in OPTIONS"
        :key="option.value"
        type="button"
        :aria-pressed="modelValue === option.value"
        class="relative py-1 text-[13px] font-medium tracking-wide transition-colors duration-500 ease-[var(--ease-cinematic)]"
        :class="modelValue === option.value ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted'"
        @click="$emit('update:modelValue', option.value)"
      >
        {{ option.label }}
        <!-- 下划线用 scale-x 而不是宽度过渡：宽度动画会触发布局，一条 1px 的线不值得。 -->
        <span
          class="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-fg transition-transform duration-500 ease-[var(--ease-cinematic)]"
          :class="modelValue === option.value ? 'scale-x-100' : 'scale-x-0'"
        />
      </button>
    </div>
  </div>
</template>
