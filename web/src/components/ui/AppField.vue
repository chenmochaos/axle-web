<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * 表单输入项。**项目里第一个表单控件，所以它同时也是这一层的约定。**
 *
 * 约定内容（改这个文件前先读，改完记得同步 `CLAUDE.md`）：
 *
 * 1. **`label` 必填。** 没有 label 的输入框对读屏和视力障碍用户等于不存在，
 *    占位符不能顶替 label（它有内容就消失）。这里不给「无 label」的口子。
 * 2. **错误态不用红色。** 全站零彩色，红色会打破这条。错误靠**加深边框**（`border-fg`，
 *    近黑）+ 一行带前缀的说明文字来表达；对比度和「哪里错了」都比红色更清楚。
 * 3. **错误与提示互斥。** 有 error 就显示 error —— 一句提示和一句报错同时出现，
 *    用户不知道该看哪句。
 * 4. **焦点态统一走 `focus:border-fg`。** 不加彩色 ring，也不加 outline，
 *    靠边框从浅灰变近黑来指示焦点。
 *
 * ⚠️ 这个组件**不加 `data-reveal`** —— 那是页面分区的入场动画标记，由 `useReveal`
 * 配对使用，`useReveal.spec.ts` 会扫描每一对。表单控件是原子的，不参与入场编排。
 */

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** 可见标签，必填（见约定 1） */
    label: string
    type?: string
    placeholder?: string
    /** 交给浏览器的自动填充提示，如 `tel` / `one-time-code` */
    autocomplete?: string
    /** 移动端键盘类型 */
    inputmode?: 'text' | 'numeric' | 'tel'
    maxlength?: number
    disabled?: boolean
    /** 非空即错误态（见约定 2） */
    error?: string
    /** 常态下的辅助说明 */
    hint?: string
  }>(),
  { type: 'text', disabled: false, error: '', hint: '' },
)

// useId 而不是让调用方传 id：两个输入框（手机号、验证码）都得有唯一的 id 才能跟
// label 的 for 对上，靠手写 id 迟早撞车。
const uid = useId()
const inputId = `field-${uid}`
const messageId = `${inputId}-message`

const hasError = computed(() => props.error.length > 0)
/** 注意是「互斥」：有 error 就不显示 hint（见约定 3） */
const message = computed(() => (hasError.value ? props.error : props.hint))

const inputClass = computed(() => [
  'h-12 w-full rounded-xl bg-transparent px-4 text-[15px] text-fg',
  'placeholder:text-fg-subtle',
  'border transition-colors duration-300 ease-[var(--ease-cinematic)]',
  'disabled:opacity-35 disabled:cursor-not-allowed',
  'focus:outline-none',
  hasError.value
    ? 'border-fg' // 错误：边框加深到近黑
    : 'border-line focus:border-fg',
])
</script>

<template>
  <div class="flex flex-col gap-2">
    <label :for="inputId" class="text-[13px] font-medium text-fg-muted">
      {{ label }}
    </label>

    <input
      :id="inputId"
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :maxlength="maxlength"
      :disabled="disabled"
      :aria-invalid="hasError || undefined"
      :aria-describedby="message ? messageId : undefined"
      :class="inputClass"
    />

    <!-- 错误与提示共用一行位置：两行都渲染会让表单在出错时跳一下高 -->
    <p
      v-if="message"
      :id="messageId"
      :role="hasError ? 'alert' : undefined"
      class="text-[13px] leading-snug"
      :class="hasError ? 'text-fg' : 'text-fg-subtle'"
    >
      <!-- 错误用一个近黑短横前缀做视觉锚点 —— 不用颜色时，符号是唯一的区分手段 -->
      <span v-if="hasError" aria-hidden="true">—&nbsp;</span>{{ message }}
    </p>
  </div>
</template>
