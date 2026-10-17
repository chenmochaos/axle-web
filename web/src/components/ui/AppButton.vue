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
    /**
     * 提交中。语义上等价于「不可点」，但视觉上比 disabled 轻一档 ——
     * 35% 透明度看着像坏了，60% 才是「正在做，别急」。不加转圈图标（体系里没有）。
     */
    loading?: boolean
    block?: boolean
  }>(),
  { variant: 'solid', size: 'md', disabled: false, loading: false, block: false },
)

/**
 * 不可点 = disabled 或 loading。
 *
 * ⚠️ 这里同时修掉了一个老 bug。原来的写法是
 * `:disabled="to ? undefined : disabled"` —— 意思是「RouterLink 没有 disabled 属性，
 * 那就别传」。后果是**带 `to` 的按钮传 disabled 会被静默丢掉**，而且
 * `disabled:pointer-events-none` 也压不住它（`:disabled` 伪类不匹配 `<a>`），
 * 于是一个「禁用」的链接按钮照样能点、照样跳页。
 *
 * 正确的做法是：不可点时**根本不渲染 RouterLink**，改渲染真正的 `<button disabled>`。
 * 这样它既点不动、也 Tab 不到，不需要依赖任何 CSS 或伪类。
 */
const isInert = computed(() => props.disabled || props.loading)
const tag = computed(() => (props.to && !isInert.value ? RouterLink : 'button'))

const base = [
  'group relative inline-flex items-center justify-center gap-2',
  'font-medium tracking-tight whitespace-nowrap select-none',
  'transition-[transform,background-color,border-color,color,opacity] duration-500',
  'ease-[var(--ease-cinematic)]',
  'disabled:pointer-events-none',
  // 两个不透明度二选一，不并存 —— 同时挂 `opacity-60` 和 `disabled:opacity-35`
  // 谁生效取决于 Tailwind 的产出顺序，那种不确定性不值得赌
  props.loading ? 'opacity-60' : 'disabled:opacity-35',
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
    :is="tag"
    :to="tag === RouterLink ? to : undefined"
    :disabled="tag === 'button' ? isInert : undefined"
    :aria-busy="loading || undefined"
    :data-loading="loading || undefined"
    :class="classes"
  >
    <slot />
  </component>
</template>
