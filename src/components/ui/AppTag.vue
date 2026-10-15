<script setup lang="ts">
/**
 * 零彩色标签。层次全靠明度差，不用色相。
 * strong 用于「纯电」「一手车」这类需要跳出来的属性。
 */
withDefaults(
  defineProps<{
    tone?: 'default' | 'strong' | 'quiet'
  }>(),
  { tone: 'default' },
)
</script>

<template>
  <span
    class="inline-flex h-6 items-center rounded-full px-2.5 text-[11px] leading-none font-medium tracking-wide tabular-nums"
    :class="{
      'bg-invert text-invert-fg': tone === 'strong',
      'bg-fg/8 text-fg-muted': tone === 'default',
      'border border-line text-fg-subtle': tone === 'quiet',
    }"
  >
    <slot />
  </span>
</template>
