<script setup lang="ts">
/**
 * 应用外壳：开场幕布 + 常驻布局 + 路由转场。
 *
 * `SiteLayout` 必须在这一层，不能在各个 view 里各包一层 ——
 * 那会让每次换路由整站（含 header / footer）重建，转场无从谈起，
 * 而且 header 的 ScrollTrigger 会跟着重建一次（M1 之前就是这样）。
 *
 * 转场用 `mode="out-in"`：旧页走完 leave 新页才开始 enter，两页不会同时占位，
 * 否则页面高度在重叠期抖动、footer 上下跳。
 */
import { ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import SiteLayout from '@/layouts/SiteLayout.vue'
import IntroCurtain from '@/components/business/IntroCurtain.vue'
import { lenis } from '@/lib/lenis'
import { introWillPlay } from '@/lib/intro'

const route = useRoute()
const showIntro = ref(introWillPlay)

/**
 * 路由转场后把滚动拉回顶部。
 *
 * 挂在 `@after-leave` 而不是路由 watcher 上：`out-in` 的离开动画有 0.3s，
 * 在离开期间滚到顶会被看见（旧页一边淡出一边往上跳），等旧页卸完再滚就发生在两帧之间。
 *
 * ⚠️ 必须显式驱动 Lenis。router 的 `scrollBehavior` 走的是原生 `window.scrollTo`，
 * Lenis 内部记的 `targetScroll` 不会跟着变，下一帧它会把页面**拉回原处**
 * —— 所以 router 里那份 `scrollBehavior` 已经删掉了，滚动归这里管。
 * （和之前「脚本化滚动滚不动」是同一个坑。）
 */
function resetScroll() {
  lenis.scrollTo(0, { immediate: true })
}
</script>

<template>
  <!-- 幕布只在首页 + 本次会话首次 + 未要求减弱动效时挂载，判断在 index.html -->
  <IntroCurtain v-if="showIntro" @done="showIntro = false" />

  <SiteLayout>
    <RouterView v-slot="{ Component }">
      <Transition name="route" mode="out-in" @after-leave="resetScroll">
        <!-- key 用 path 不用 fullPath：换 path 才算换页（要转场），
             改 query 是页内状态变化，不该把整页重新挂载一遍 -->
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </SiteLayout>
</template>
