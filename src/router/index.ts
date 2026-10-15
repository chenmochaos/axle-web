import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * M1 只交付首页。其余路由先落到 PlaceholderView，
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
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '车辆详情', milestone: 'M2' },
  },
  {
    path: '/seckill/:id',
    name: 'seckill',
    component: () => import('@/views/PlaceholderView.vue'),
    meta: { title: '限时特价', milestone: 'M2' },
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
  // 平滑滚动交给 Lenis，路由切换只需把位置归零
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} — AXLE` : 'AXLE — 精选二手车'
})

export default router
