<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SiteLayout from '@/layouts/SiteLayout.vue'
import AppButton from '@/components/ui/AppButton.vue'

const route = useRoute()

const title = computed(() => (route.meta.title as string | undefined) ?? '页面')
const milestone = computed(() => (route.meta.milestone as string | undefined) ?? '后续里程碑')
</script>

<template>
  <SiteLayout>
    <section class="mx-auto flex min-h-[70vh] max-w-[1440px] flex-col justify-center px-8 lg:px-16">
      <p class="text-[11px] tracking-[0.3em] text-fg-subtle uppercase">Coming next</p>
      <h1 class="mt-5 text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.03em] text-fg">
        {{ title }}
      </h1>
      <p class="mt-5 max-w-[30rem] text-[14px] leading-[1.8] text-fg-muted">
        这一页排在 <span class="text-fg">{{ milestone }}</span>。M1 只交付首页，
        先把动效水准与视觉基调钉死，确认后再按里程碑往下铺。
      </p>
      <div class="mt-9">
        <AppButton to="/">返回首页</AppButton>
      </div>
    </section>
  </SiteLayout>
</template>
