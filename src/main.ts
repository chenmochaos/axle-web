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

createApp(App).use(createPinia()).use(router).mount('#app')
