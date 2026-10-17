<script setup lang="ts">
/**
 * 关注 / 取关按钮。
 *
 * ── 状态从哪来 ──────────────────────────────────────────────────────────
 *
 * 挂载时**只在已登录的情况下**问一次 `GET /follow/or/not/{id}`。未登录时不发请求：
 * 那个接口读 `UserHolder`，未登录必然 401，而车商主页是公开页 ——
 * 让一个游客在控制台里看到一串 401，是最容易被当成「页面坏了」的那种噪音。
 *
 * ── 点击时未登录怎么办 ──────────────────────────────────────────────────
 *
 * **不把 401 弹成错误**，而是当作一次明确的意图：跳登录页，`next` 指回当前页面。
 * 登录回来之后按钮会重新问一次状态 —— 这是唯一正确的时刻，因为关注关系属于账号。
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NeedLoginError } from '@/api/client'
import { followErrorMessage, isFollowing, setFollow } from '@/api/social'
import { useAuthStore } from '@/stores/auth'
import AppButton from '@/components/ui/AppButton.vue'

const props = withDefaults(defineProps<{ userId: number; size?: 'sm' | 'md' }>(), {
  size: 'md',
})

const emit = defineEmits<{ change: [following: boolean] }>()

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const following = ref(false)
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  if (!auth.ready) await auth.restore()
  if (!auth.isLoggedIn) return
  try {
    following.value = await isFollowing(props.userId)
  } catch {
    // 状态查询失败就当作「未关注」—— 按钮仍然可点，点击时会给出真实结果。
    // 这里不弹错：一个查不到的状态不值得打断页面。
  }
})

async function toggle(): Promise<void> {
  error.value = ''

  if (!auth.isLoggedIn) {
    await router.push({ name: 'login', query: { next: route.fullPath } })
    return
  }

  loading.value = true
  try {
    const next = !following.value
    await setFollow(props.userId, next)
    following.value = next
    emit('change', next)
  } catch (err) {
    if (err instanceof NeedLoginError) {
      // token 在页面打开期间过期了。`client.ts` 已经清了 token，这里只需引导登录。
      await router.push({ name: 'login', query: { next: route.fullPath } })
      return
    }
    error.value = followErrorMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col items-start gap-2">
    <AppButton
      :variant="following ? 'outline' : 'solid'"
      :size="size"
      :loading="loading"
      @click="toggle"
    >
      {{ following ? '已关注' : '关注' }}
    </AppButton>
    <p v-if="error" class="text-[12px] leading-snug text-fg" role="alert">
      <span aria-hidden="true">—&nbsp;</span>{{ error }}
    </p>
  </div>
</template>
