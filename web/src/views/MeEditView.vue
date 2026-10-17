<script setup lang="ts">
/**
 * 编辑资料 `/me/edit`。需要登录。
 *
 * ── 头像为什么要先上传再保存 ────────────────────────────────────────────
 *
 * `PUT /user/profile` 只接受字符串 URL（`UserDTO.icon`），没有 multipart 分支。
 * 所以头像是「先 `POST /upload/review` 拿到 `/imgs/...`，再随昵称一起提交」。
 * 上传成功但用户最后点了取消，服务端会多一张没人引用的图 —— 这是当前接口
 * 形状的固有代价；换成真正的「头像上传」接口之前，不值得在前端伪造删除逻辑。
 *
 * ── 保存后为什么同步 auth store ─────────────────────────────────────────
 *
 * 导航栏头像、`/me` 的欢迎语都读 `auth.user`。接口返回的是更新后的 UserDTO，
 * 直接 `applyUser(next)` 把它铺回 store，页面不用再拉一次 `/user/me`。
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NeedLoginError } from '@/api/client'
import { uploadReviewImage } from '@/api/review'
import { updateProfile } from '@/api/user'
import { useRequireLogin } from '@/composables/useRequireLogin'
import { useReveal } from '@/composables/useReveal'
import AppButton from '@/components/ui/AppButton.vue'
import AppField from '@/components/ui/AppField.vue'

const router = useRouter()
const route = useRoute()
const { ensure, auth } = useRequireLogin()

const nickName = ref('')
const icon = ref('')
const uploading = ref(false)
const saving = ref(false)
const formError = ref('')
const nickError = ref('')
const loaded = ref(false)

const pageRoot = ref<HTMLElement | null>(null)
useReveal(pageRoot, { children: true, stagger: 0.09, y: 22, ready: loaded })

const initial = ref('')

onMounted(async () => {
  if (!(await ensure())) {
    loaded.value = true
    return
  }
  nickName.value = auth.user?.nickName ?? ''
  icon.value = auth.user?.icon ?? ''
  initial.value = nickName.value.slice(0, 1)
  loaded.value = true
})

async function onAvatar(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  formError.value = ''
  if (!file.type.startsWith('image/')) {
    formError.value = '头像必须是图片文件'
    return
  }

  uploading.value = true
  try {
    icon.value = await uploadReviewImage(file)
  } catch (err) {
    if (err instanceof NeedLoginError) {
      await router.push({ name: 'login', query: { next: route.fullPath } })
      return
    }
    formError.value = err instanceof Error ? err.message : '头像上传失败'
  } finally {
    uploading.value = false
  }
}

async function onSave(): Promise<void> {
  nickError.value = ''
  formError.value = ''
  if (!nickName.value.trim()) {
    nickError.value = '昵称不能为空'
    return
  }
  if (uploading.value) {
    formError.value = '头像还在上传，请稍候'
    return
  }

  saving.value = true
  try {
    const next = await updateProfile({ nickName: nickName.value.trim(), icon: icon.value })
    auth.applyUser(next)
    await router.replace('/me')
  } catch (err) {
    if (err instanceof NeedLoginError) {
      await router.push({ name: 'login', query: { next: route.fullPath } })
      return
    }
    formError.value = err instanceof Error ? err.message : '保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div ref="pageRoot" class="pt-[4.5rem]">
    <section class="mx-auto max-w-[36rem] px-8 py-16 lg:px-16 lg:py-24">
      <header data-reveal>
        <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Profile</p>
        <h1
          class="mt-4 text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
        >
          编辑资料
        </h1>
      </header>

      <form class="mt-12 flex flex-col gap-8" @submit.prevent="onSave">
        <div class="flex items-center gap-5" data-reveal>
          <img
            v-if="icon"
            :src="icon"
            alt="当前头像"
            class="h-20 w-20 rounded-full object-cover"
          />
          <span
            v-else
            class="grid h-20 w-20 place-items-center rounded-full border border-line text-[26px] font-medium text-fg"
            aria-hidden="true"
          >
            {{ nickName.slice(0, 1) || initial }}
          </span>

          <label
            class="cursor-pointer text-[13px] text-fg-muted transition-colors duration-300 hover:text-fg"
            :class="uploading || saving ? 'pointer-events-none opacity-50' : ''"
          >
            <input
              type="file"
              accept="image/*"
              class="sr-only"
              :disabled="uploading || saving"
              @change="onAvatar"
            />
            {{ uploading ? '上传中…' : '更换头像' }}
          </label>
        </div>

        <div data-reveal>
          <AppField
            v-model="nickName"
            label="昵称"
            :maxlength="20"
            placeholder="你的显示名称"
            :error="nickError"
            :disabled="saving"
          />
        </div>

        <p v-if="formError" class="text-[13px] leading-snug text-fg" role="alert" data-reveal>
          <span aria-hidden="true">—&nbsp;</span>{{ formError }}
        </p>

        <div class="flex items-center gap-4" data-reveal>
          <AppButton type="submit" size="lg" :loading="saving" :disabled="uploading">
            {{ saving ? '保存中…' : '保存' }}
          </AppButton>
          <AppButton variant="ghost" size="lg" to="/me">取消</AppButton>
        </div>
      </form>
    </section>
  </div>
</template>
