<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import AppButton from '@/components/ui/AppButton.vue'

const scrolled = ref(false)
let ctx: gsap.Context | null = null

const navItems = [
  { label: '车源', to: '/cars' },
  { label: '口碑', to: '/blog' },
  { label: '关注', to: '/feed' },
]

const footerGroups = [
  {
    title: '买车',
    links: [
      { label: '在售车源', to: '/cars' },
      { label: '限时特价', to: '/seckill/1' },
    ],
  },
  {
    title: '社区',
    links: [
      { label: '提车口碑', to: '/blog' },
      { label: '关注动态', to: '/feed' },
    ],
  },
  {
    title: '我的',
    links: [
      { label: '个人中心', to: '/me' },
      { label: '登录', to: '/login' },
    ],
  },
]

onMounted(() => {
  // 这里以前会 classList.add('theme-dark')。全站亮色后没有第二套主题，
  // 主题类随之取消 —— 不要再加回来，tokens.css 里也没有暗色那套了。
  ctx = gsap.context(() => {
    ScrollTrigger.create({
      start: 56,
      end: 99999,
      onToggle: (self) => {
        scrolled.value = self.isActive
      },
    })
  })
})

onUnmounted(() => ctx?.revert())
</script>

<template>
  <div class="min-h-screen bg-bg text-fg">
    <header
      class="fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-700 ease-[var(--ease-cinematic)]"
      :class="
        scrolled
          ? 'border-line bg-bg/85 backdrop-blur-xl'
          : 'border-transparent bg-transparent'
      "
    >
      <div class="mx-auto flex h-[4.5rem] max-w-[1440px] items-center gap-10 px-8 lg:px-16">
        <RouterLink
          to="/"
          class="font-display text-[17px] font-medium tracking-[0.3em] text-fg transition-opacity duration-300 hover:opacity-70"
        >
          AXLE
        </RouterLink>

        <nav class="hidden items-center gap-8 sm:flex">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="text-[13px] font-medium text-fg-muted transition-colors duration-500 hover:text-fg"
            active-class="text-fg"
          >
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <AppButton variant="ghost" size="sm" to="/login">登录</AppButton>
          <AppButton size="sm" to="/cars">找车</AppButton>
        </div>
      </div>
    </header>

    <main>
      <slot />
    </main>

    <footer class="border-t border-line">
      <div
        class="mx-auto flex max-w-[1440px] flex-col gap-10 px-8 py-16 lg:flex-row lg:items-end lg:justify-between lg:px-16"
      >
        <div>
          <p class="font-display text-[17px] font-medium tracking-[0.3em] text-fg">AXLE</p>
          <p class="mt-4 max-w-[28rem] text-[13px] leading-[1.8] text-pretty text-fg-muted">
            一车一况，明码标价。每台车经过 176 项检测，随车附第三方检测报告。
          </p>
        </div>

        <div class="flex flex-wrap gap-x-16 gap-y-9">
          <div v-for="group in footerGroups" :key="group.title">
            <p class="text-[11px] tracking-[0.18em] text-fg-subtle uppercase">{{ group.title }}</p>
            <div class="mt-4 flex flex-col gap-2.5">
              <RouterLink
                v-for="link in group.links"
                :key="link.to"
                :to="link.to"
                class="text-[13px] text-fg-muted transition-colors duration-300 hover:text-fg"
              >
                {{ link.label }}
              </RouterLink>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-line">
        <p class="mx-auto max-w-[1440px] px-8 py-6 text-[11px] tracking-wide text-fg-subtle lg:px-16">
          © 2026 AXLE · 演示项目，数据为示例内容
        </p>
      </div>
    </footer>
  </div>
</template>
