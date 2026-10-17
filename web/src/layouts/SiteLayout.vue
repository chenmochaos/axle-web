<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { useAuthStore } from '@/stores/auth'
import AppButton from '@/components/ui/AppButton.vue'

const auth = useAuthStore()
const { user, ready: authReady, isLoggedIn } = storeToRefs(auth)

/**
 * 头像缺失时用昵称首字顶上。后端 `icon` 未设置时给的是**空串**，
 * 直接 `<img src="">` 会渲染成一个破图图标 —— 比没有头像更难看。
 */
const initial = computed(() => user.value?.nickName?.slice(0, 1) ?? '')

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
      // 这里原来有一条「限时特价 → /seckill/1」。删掉的理由：秒杀券是**按车**的
      // （`GET /voucher/list/{shopId}`），没有任何接口能列出「全部特价」，
      // 那个写死的 `1` 也不是任何一张真实券的 id。秒杀的入口就是车辆详情页。
    ],
  },
  {
    title: '社区',
    links: [
      { label: '口碑广场', to: '/blog' },
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
          <!-- 登录态未确定时这一格**留白**，不要先摆「登录」再换成昵称。
               `main.ts` 里的 `restore()` 是刻意不 await 的（否则会推迟首屏与开场动画），
               所以「未知」这一小段时间总是存在。占位宽度与下面那块接近，避免布局抖一下。 -->
          <span v-if="!authReady" class="h-8 w-14" aria-hidden="true" />

          <RouterLink
            v-else-if="isLoggedIn"
            to="/me"
            class="flex items-center gap-2.5 transition-opacity duration-300 hover:opacity-70"
          >
            <img
              v-if="user?.icon"
              :src="user.icon"
              alt=""
              class="h-7 w-7 rounded-full object-cover"
            />
            <span
              v-else
              class="grid h-7 w-7 place-items-center rounded-full border border-line text-[12px] font-medium text-fg"
            >
              {{ initial }}
            </span>
            <span class="max-w-[7rem] truncate text-[13px] font-medium text-fg-muted">
              {{ user?.nickName }}
            </span>
          </RouterLink>

          <AppButton v-else variant="ghost" size="sm" to="/login">登录</AppButton>
          <AppButton size="sm" to="/cars">找车</AppButton>
        </div>
      </div>
    </header>

    <!-- min-h-[100svh]：`out-in` 转场期间旧内容先卸载，main 高度会瞬间塌到 0，
         footer 于是跳到页首。根节点只有 min-h-screen，拦不住这一幕 —— 高度要在这里撑住。 -->
    <main class="min-h-[100svh]">
      <slot />
    </main>

    <footer class="border-t border-line">
      <div
        class="mx-auto flex max-w-[1440px] flex-col gap-10 px-8 py-16 lg:flex-row lg:items-end lg:justify-between lg:px-16"
      >
        <div>
          <p class="font-display text-[17px] font-medium tracking-[0.3em] text-fg">AXLE</p>
          <p class="mt-4 max-w-[28rem] text-[13px] leading-[1.8] text-pretty text-fg-muted">
            一车一况，明码标价。车源参数、限时特价与购车券都在车辆详情页。
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
