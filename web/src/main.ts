import { createApp } from 'vue'
import { createPinia } from 'pinia'

// 副作用导入：建立全局唯一的 Lenis 实例，并完成与 GSAP ticker 的同步。
// 必须早于任何组件挂载 —— 组件里只准 import 单例，不准 new Lenis()。
import '@/lib/lenis'

// 副作用导入：读 index.html 内联脚本留下的 `intro-boot` class，建好开场闸门。
// 同样要早于组件挂载 —— HeroSection 与 App 都从它取 `introWillPlay` / `introDone`。
import '@/lib/intro'

import './styles/main.css'
import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from './api/client'
import { useAuthStore } from './stores/auth'

const app = createApp(App)

// 显式持有 pinia 并传给下面的 `useAuthStore(pinia)`：模块作用域里没有组件实例，
// 「当前激活的 pinia」是 `app.use()` 这个副作用的产物，靠它等于依赖调用顺序。
const pinia = createPinia()
app.use(pinia)
app.use(router)

/**
 * 未登录/登录过期时的统一善后：清掉本地登录态，送去登录页，并记住回来的路。
 *
 * ⚠️ **必须自己防重入**（`client.ts` 把这件事的责任放在了注入方）。跳登录页会触发
 * 新页面的请求，那些请求若也 401 就又调一次这里 —— 「跳转 → 401 → 跳转」的死循环。
 * 断环的办法就是「已经在登录页就不跳」。
 */
setUnauthorizedHandler(() => {
  useAuthStore(pinia).forget()

  const route = router.currentRoute.value
  if (route.name === 'login') return

  void router.push({ name: 'login', query: { next: route.fullPath } })
})

// 启动恢复登录态。**不 await**：等它会把首屏和开场动画一起推迟到一个网络往返之后。
// 头部的「登录 / 昵称」靠 store 的 `ready` 标志先渲染占位，恢复完再切换。
void useAuthStore(pinia).restore()

app.mount('#app')
