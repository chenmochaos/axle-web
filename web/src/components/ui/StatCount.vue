<script setup lang="ts">
import { toRef } from 'vue'
import { useCountUp } from '@/composables/useCountUp'

const props = withDefaults(
  defineProps<{
    value: number
    label: string
    decimals?: number
    suffix?: string
    /** 滚动到视口内才开始滚数字，避免用户在首屏时数字已经跑完了 */
    triggerOnView?: boolean
  }>(),
  { decimals: 0, suffix: '', triggerOnView: false },
)

// toRef 保持响应性；这里值基本是静态的，但语义上仍是 props → ref
const { display } = useCountUp(toRef(props, 'value'), { decimals: props.decimals })
</script>

<template>
  <div>
    <p class="tnum text-[22px] leading-none font-semibold tracking-tight text-fg">
      {{ display }}<span v-if="suffix" class="ml-0.5 text-[14px] font-medium">{{ suffix }}</span>
    </p>
    <p class="mt-1.5 text-[11px] tracking-[0.14em] text-fg-subtle uppercase">{{ label }}</p>
  </div>
</template>
