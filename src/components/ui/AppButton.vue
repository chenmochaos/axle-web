<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = withDefaults(
  defineProps<{
    variant?: 'solid' | 'outline' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    /** 传了就渲染成 RouterLink */
    to?: string
    disabled?: boolean
    block?: boolean
  }>(),
  { variant: 'solid', size: 'md', disabled: false, block: false },
)

const base = [
  'group relative inline-flex items-center justify-center gap-2',
  'font-medium tracking-tight whitespace-nowrap select-none',
  'transition-[transform,background-color,border-color,color,opacity] duration-500',
  'ease-[var(--ease-cinematic)]',
  'disabled:pointer-events-none disabled:opacity-35',
].join(' ')

const variants: Record<NonNullable<typeof props.variant>, string> = {
  // 明度反转：主按钮 = 纯黑底白字。全站亮色后 --invert-* 恒为黑底白字，不带任何色相
  solid: 'bg-invert text-invert-fg hover:-translate-y-0.5 active:translate-y-0',
  outline: 'border border-line text-fg hover:border-fg hover:-translate-y-0.5',
  ghost: 'text-fg-muted hover:text-fg',
}

const sizes: Record<NonNullable<typeof props.size>, string> = {
  sm: 'h-9 px-4 text-[13px] rounded-full',
  md: 'h-11 px-6 text-sm rounded-full',
  lg: 'h-[3.25rem] px-9 text-[15px] rounded-full',
}

const classes = computed(() => [
  base,
  variants[props.variant],
  sizes[props.size],
  props.block ? 'w-full' : '',
])
</script>

<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to"
    :disabled="to ? undefined : disabled"
    :class="classes"
  >
    <slot />
  </component>
</template>
