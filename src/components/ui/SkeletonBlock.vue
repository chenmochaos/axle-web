<script setup lang="ts">
/**
 * 骨架屏。扫光是明度渐变而非彩色，亮暗区都能用。
 * prefers-reduced-motion 下由 main.css 的全局规则停掉动画。
 */
withDefaults(defineProps<{ rounded?: string }>(), { rounded: 'rounded-xl' })
</script>

<template>
  <div class="skeleton" :class="rounded" />
</template>

<style scoped>
.skeleton {
  position: relative;
  overflow: hidden;
  background: var(--bg-raised);
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in oklab, var(--fg) 7%, transparent) 50%,
    transparent 100%
  );
  animation: skeleton-sweep 1.6s var(--ease-cinematic) infinite;
}

@keyframes skeleton-sweep {
  100% {
    transform: translateX(100%);
  }
}
</style>
