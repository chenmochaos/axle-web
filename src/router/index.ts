import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * 已交付 M1 首页、M2 详情页。其余路由先落到 PlaceholderView，
 * 这样导航点得动、URL 结构一次定死，后续填实现不用改路由。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/cars/:brand(\\d+)?',
    name: 'cars',
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '车源列表', milestone: 'M3' },
  },
  {
    path: '/car/:id',
    name: 'car',
    component: () => import('@/views/CarDetailView.vue'),
    meta: { title: '车辆详情' },
  },
  {
    path: '/seckill/:id',
    name: 'seckill',
    component: () => import('@/views/PlaceholderView.vue'),
    // 抢购要写订单，依赖登录态 —— 和登录一起放进 M3，详见 docs/specs 的里程碑表
    meta: { title: '限时特价', milestone: 'M3' },
  },
  {
    path: '/blog',
    name: 'blog',
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '口碑广场', milestone: 'M4' },
  },
  {
    path: '/blog/:id',
    name: 'blog-detail',
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '口碑详情', milestone: 'M4' },
  },
  {
    path: '/feed',
    name: 'feed',
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '关注动态', milestone: 'M4' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '登录', milestone: 'M3' },
  },
  {
    path: '/me',
    name: 'me',
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '个人中心', milestone: 'M5' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '页面不存在', milestone: '—' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  // 这里**故意不写 scrollBehavior**。它走原生 window.scrollTo，有两个毛病：
  // ① Lenis 内部记的 targetScroll 不会跟着变，下一帧会把页面拉回原处；
  // ② 它在导航确认时就执行，而 <Transition mode="out-in"> 的离开动画还要跑 0.3s，
  //    于是旧页会「一边淡出一边往上跳」。
  // 滚动归零改由 App.vue 的 @after-leave 驱动 Lenis 完成，见那里的注释。
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} — AXLE` : 'AXLE — 精选二手车'
})

export default router
