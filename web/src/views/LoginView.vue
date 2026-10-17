<script setup lang="ts">
/**
 * 登录页 `/login`。手机号 + 验证码，两步都得走后端那套真流程。
 *
 * ── 这个视图为什么没有骨架屏 ────────────────────────────────────────────
 *
 * 另外两个 M3 页面（抢购、列表）都要等真实数据，骨架屏是必须的。登录页没有数据要等，
 * 只有一次「我是不是已经登录了」的检查；为它铺一块骨架，结果是**一闪而过的灰块**，
 * 比什么都不铺更烦人。所以这里直接渲染表单，只把提交按钮在检查完成前按住。
 *
 * ── 三处与后端措辞对齐的做法 ─────────────────────────────────────────────
 *
 * 1. 手机号的提示直接用后端的字面量 `手机号格式错误`。前端的正则就是后端那条
 *    （`lib/phone.ts` 逐字照抄并由 spec 守着），同一个输入两边结论一致，那就没有理由
 *    给同一件事准备两种说法。
 * 2. 登录失败时按错误信息**分流到对应字段**：`验证码错误` 挂到验证码上、手机号那条挂到
 *    手机号上、其余挂到表单级。全堆在表单顶部会让用户猜是哪一项错了。
 * 3. `next` 只接受站内路径。见下面的 `nextPath`。
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ApiError, USE_MOCK } from '@/api/client'
import { MOCK_SMS_CODE, sendCode } from '@/api/user'
import { isValidPhone, isValidSmsCode } from '@/lib/phone'
import { useCountdown } from '@/composables/useCountdown'
import { useReveal } from '@/composables/useReveal'
import { useAuthStore } from '@/stores/auth'
import AppField from '@/components/ui/AppField.vue'
import AppButton from '@/components/ui/AppButton.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { ready: authReady } = storeToRefs(auth)

const phone = ref('')
const code = ref('')

const phoneError = ref('')
const codeError = ref('')
const formError = ref('')

const sending = ref(false)
const submitting = ref(false)

const { seconds, running, start } = useCountdown(60)

/** 与后端 `RegexUtils` 同一条判据，所以也用它同一句话 */
const MSG_PHONE = '手机号格式错误'
const MSG_CODE = '验证码错误'

const formRoot = ref<HTMLElement | null>(null)
useReveal(formRoot, { children: true, stagger: 0.09, y: 22, ready: authReady })

/**
 * 登录后回哪去。
 *
 * ⚠️ **只接受站内路径。** `?next=` 是用户可以随手改的，若直接丢给 `router.replace`，
 * `?next=https://evil.example` 就成了一次开放重定向 —— 用户从我们的域名被送到别处，
 * 而地址栏在跳转前一刻还是我们的。`//evil.example` 这种协议相对写法同样要拦
 * （它以 `/` 开头，但浏览器会当成跨域）。
 */
const nextPath = computed(() => {
  const raw = route.query.next
  const path = typeof raw === 'string' ? raw : ''
  if (!path.startsWith('/') || path.startsWith('//')) return '/'
  return path
})

/** 已登录就不该再看登录页：直接送回原处，别让他再登一遍 */
if (!auth.ready) {
  void auth.restore().then(() => {
    if (auth.isLoggedIn) void router.replace(nextPath.value)
  })
} else if (auth.isLoggedIn) {
  void router.replace(nextPath.value)
}

/**
 * 开发提示。**只在 dev 构建里出现**（`import.meta.env.DEV`），生产包里这段会被摇掉。
 *
 * 真机模式下验证码只打在后端控制台（`UserServiceImpl` 的 `log.debug`，没有短信网关），
 * 不说这一句，本地调试的人会一直等一条永远不来的短信。
 */
const devHint = computed(() => {
  if (!import.meta.env.DEV) return ''
  return USE_MOCK
    ? `mock 模式：任何合法手机号都能登，验证码固定 ${MOCK_SMS_CODE}`
    : '真机模式：验证码只打在后端控制台日志里（log.debug），没有短信网关'
})

const sent = ref(false)

async function onSendCode(): Promise<void> {
  phoneError.value = ''
  formError.value = ''

  if (!isValidPhone(phone.value)) {
    phoneError.value = MSG_PHONE
    return
  }

  sending.value = true
  try {
    await sendCode(phone.value)
    sent.value = true
    start()
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : '发送失败，请稍后重试'
  } finally {
    sending.value = false
  }
}

async function onSubmit(): Promise<void> {
  phoneError.value = ''
  codeError.value = ''
  formError.value = ''

  if (!isValidPhone(phone.value)) {
    phoneError.value = MSG_PHONE
    return
  }
  // 前端这条 6 位检查是交互便利，不是后端规则（后端根本没校验验证码格式，见 lib/phone.ts）
  if (!isValidSmsCode(code.value)) {
    codeError.value = '请填写 6 位验证码'
    return
  }

  submitting.value = true
  try {
    await auth.login(phone.value, code.value)
    await router.replace(nextPath.value)
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '登录失败，请稍后重试'
    // 按措辞分流回字段，而不是全堆在顶部
    if (msg === MSG_PHONE) phoneError.value = msg
    else if (msg === MSG_CODE) codeError.value = msg
    else formError.value = msg
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    ref="formRoot"
    class="mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-[1440px] items-center px-8 py-16 lg:px-16"
  >
    <div class="w-full max-w-[26rem]">
      <header data-reveal>
        <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Sign in</p>
        <h1
          class="mt-4 text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
        >
          手机号登录
        </h1>
        <p class="mt-4 text-[14px] leading-[1.9] text-fg-muted">
          抢购限时特价需要先登录。没注册过的手机会自动建号。
        </p>
      </header>

      <form class="mt-10 flex flex-col gap-6" data-reveal @submit.prevent="onSubmit">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <AppField
              v-model="phone"
              label="手机号"
              type="tel"
              inputmode="numeric"
              autocomplete="tel"
              :maxlength="11"
              placeholder="11 位手机号"
              :error="phoneError"
              :disabled="submitting"
            />
          </div>
          <!-- ⚠️ `type="button"` 必须有：按钮在 <form> 里，浏览器默认给的是 type="submit"，
               少了这一条，点「获取验证码」会连带把登录表单提交掉。
               外面这层 div 承担 pt-7（= label 行高 + gap），让按钮顶边对齐输入框顶边 ——
               直接给 AppButton 加 pt 不行，它的根元素就是那个定高 h-11 的 <button>。 -->
          <div class="shrink-0 pt-7">
            <AppButton
              type="button"
              variant="outline"
              :loading="sending"
              :disabled="running || submitting"
              @click="onSendCode"
            >
              <!-- 秒数用 tnum 等宽，否则 60→59 时按钮宽度会跳 -->
              <span class="tnum">{{ running ? `${seconds}s 后重试` : '获取验证码' }}</span>
            </AppButton>
          </div>
        </div>

        <AppField
          v-model="code"
          label="验证码"
          inputmode="numeric"
          autocomplete="one-time-code"
          :maxlength="6"
          placeholder="6 位数字"
          :error="codeError"
          :hint="sent && !codeError ? '验证码 2 分钟内有效' : ''"
          :disabled="submitting"
        />

        <p v-if="formError" class="text-[13px] leading-snug text-fg" role="alert">
          <span aria-hidden="true">—&nbsp;</span>{{ formError }}
        </p>

        <AppButton type="submit" size="lg" block :loading="submitting" :disabled="!authReady">
          {{ submitting ? '登录中…' : '登录' }}
        </AppButton>

        <p v-if="devHint" class="text-[12px] leading-relaxed text-fg-subtle">
          {{ devHint }}
        </p>
      </form>
    </div>
  </div>
</template>
