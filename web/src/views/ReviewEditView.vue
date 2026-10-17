<script setup lang="ts">
/**
 * 发布口碑 `/review/edit`。需要登录。
 *
 * ── 车源选择器为什么把全部车源拉下来 ────────────────────────────────────
 *
 * 后端没有「搜索车」的独立接口（`/car/search` 在改名时并未实现），只有分页的
 * `/car/list`。口碑必须挂在一台具体车上，所以选择器要能覆盖全部在售车源：
 * 逐页拉到 `hasMore === false` 为止，上限 5 页（50 台）—— 再多就不像是给人选的，
 * 那时应该做搜索而不是继续堆下拉框。这是有意的取舍，不是偷懒。
 *
 * ── 图片上传 ────────────────────────────────────────────────────────────
 *
 * 每张图单独调 `POST /upload/review`，后端返回 `/imgs/...` 的 URL。
 * 提交时只传 URL 数组，后端把它拼成逗号串。**上传失败就不提交**：
 * 少一张图的「成功发布」比一次明确的失败更难被发现。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NeedLoginError } from '@/api/client'
import { fetchCarsByBrand } from '@/api/car'
import { saveReview, uploadReviewImage } from '@/api/review'
import type { Car } from '@/api/types'
import { useRequireLogin } from '@/composables/useRequireLogin'
import { useReveal } from '@/composables/useReveal'
import AppButton from '@/components/ui/AppButton.vue'
import AppField from '@/components/ui/AppField.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

/** 后端 `tb_blog.images` 的注释是「最多 9 张」—— 界面照这个口径拦 */
const MAX_IMAGES = 9
/** 全量拉取的页数上限。5 × 10 = 50 台，超过这个量级该做搜索而不是继续拉 */
const MAX_CAR_PAGES = 5

const router = useRouter()
const route = useRoute()
const { ensure } = useRequireLogin()

const cars = ref<Car[]>([])
const loadingCars = ref(true)

const carId = ref<number | null>(null)
const title = ref('')
const content = ref('')
const images = ref<string[]>([])
const uploading = ref(false)
const submitting = ref(false)

const titleError = ref('')
const carError = ref('')
const formError = ref('')
const loaded = ref(false)

const pageRoot = ref<HTMLElement | null>(null)
useReveal(pageRoot, { children: true, stagger: 0.09, y: 22, ready: loaded })

const remaining = computed(() => MAX_IMAGES - images.value.length)

async function loadCars(): Promise<void> {
  const all: Car[] = []
  for (let page = 1; page <= MAX_CAR_PAGES; page++) {
    const result = await fetchCarsByBrand({ current: page })
    // 去重：分页期间有车下架时，后端会把后一页的条目顺移，造成重复
    const known = new Set(all.map((c) => c.id))
    all.push(...result.list.filter((c) => !known.has(c.id)))
    if (!result.hasMore) break
  }
  cars.value = all
}

onMounted(async () => {
  if (!(await ensure())) return

  try {
    await loadCars()
    // 预选：从车源详情页点「写口碑」过来时带 `?carId=`，省一次选择
    const preset = Number(route.query.carId)
    if (Number.isFinite(preset) && cars.value.some((c) => c.id === preset)) {
      carId.value = preset
    }
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '车源加载失败'
  } finally {
    loadingCars.value = false
    loaded.value = true
  }
})

async function onFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  // 同一个文件连选两次也要能触发 change —— 清空 value
  input.value = ''
  if (files.length === 0) return

  formError.value = ''
  uploading.value = true
  try {
    for (const file of files) {
      if (images.value.length >= MAX_IMAGES) {
        formError.value = `最多上传 ${MAX_IMAGES} 张图片`
        break
      }
      if (!file.type.startsWith('image/')) {
        formError.value = '只能上传图片文件'
        continue
      }
      images.value.push(await uploadReviewImage(file))
    }
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '图片上传失败'
  } finally {
    uploading.value = false
  }
}

function removeImage(index: number): void {
  images.value.splice(index, 1)
}

async function onSubmit(): Promise<void> {
  titleError.value = ''
  carError.value = ''
  formError.value = ''

  if (carId.value == null) {
    carError.value = '请选择关联车源'
    return
  }
  if (!title.value.trim()) {
    titleError.value = '标题不能为空'
    return
  }
  if (!content.value.trim()) {
    formError.value = '内容不能为空'
    return
  }
  if (uploading.value) {
    formError.value = '图片还在上传，请稍候'
    return
  }

  submitting.value = true
  try {
    const id = await saveReview({
      carId: carId.value,
      title: title.value,
      content: content.value,
      images: images.value,
    })
    await router.replace(`/review/${id}`)
  } catch (err) {
    if (err instanceof NeedLoginError) {
      await router.push({ name: 'login', query: { next: route.fullPath } })
      return
    }
    formError.value = err instanceof Error ? err.message : '发布失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div ref="pageRoot" class="pt-[4.5rem]">
    <section class="mx-auto max-w-[46rem] px-8 py-16 lg:px-16 lg:py-24">
      <header data-reveal>
        <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Publish</p>
        <h1
          class="mt-4 text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
        >
          发布口碑
        </h1>
        <p class="mt-4 max-w-[34rem] text-[14px] leading-[1.9] text-fg-muted">
          写清车型、年款和真实车况。口碑会同步推送给关注你的车友。
        </p>
      </header>

      <div v-if="loadingCars" class="mt-12 space-y-6">
        <SkeletonBlock rounded="rounded-xl" class="h-12" />
        <SkeletonBlock rounded="rounded-xl" class="h-12" />
        <SkeletonBlock rounded="rounded-xl" class="h-40" />
      </div>

      <form v-else class="mt-12 flex flex-col gap-7" @submit.prevent="onSubmit">
        <div data-reveal>
          <label for="review-car" class="text-[13px] font-medium text-fg-muted">关联车源</label>
          <select
            id="review-car"
            v-model.number="carId"
            class="mt-2 h-12 w-full rounded-xl border bg-transparent px-4 text-[15px] text-fg transition-colors duration-300 focus:border-fg focus:outline-none"
            :class="carError ? 'border-fg' : 'border-line'"
            :disabled="submitting || cars.length === 0"
          >
            <option :value="null" disabled>选择一台车</option>
            <option v-for="car in cars" :key="car.id" :value="car.id">
              {{ car.brand }} · {{ car.name }}
            </option>
          </select>
          <p v-if="carError" class="mt-2 text-[13px] text-fg" role="alert">
            <span aria-hidden="true">—&nbsp;</span>{{ carError }}
          </p>
          <p v-else-if="cars.length === 0" class="mt-2 text-[13px] text-fg-subtle">
            当前没有可关联的在售车源。
          </p>
        </div>

        <div data-reveal>
          <AppField
            v-model="title"
            label="标题"
            :maxlength="80"
            placeholder="例如：提车三个月，M4 CSL 的真实用车感受"
            :error="titleError"
            :disabled="submitting"
          />
        </div>

        <div data-reveal>
          <label for="review-content" class="text-[13px] font-medium text-fg-muted">正文</label>
          <textarea
            id="review-content"
            v-model="content"
            rows="10"
            placeholder="验车过程、保养记录、油耗、通病……具体的信息比结论更有用。"
            class="mt-2 w-full resize-y rounded-xl border border-line bg-transparent px-4 py-3 text-[15px] leading-[1.9] text-fg transition-colors duration-300 placeholder:text-fg-subtle focus:border-fg focus:outline-none disabled:opacity-35"
            :disabled="submitting"
          />
        </div>

        <div data-reveal>
          <div class="flex items-center justify-between gap-4">
            <span class="text-[13px] font-medium text-fg-muted">配图</span>
            <span class="tnum text-[12px] text-fg-subtle">{{ images.length }} / {{ MAX_IMAGES }}</span>
          </div>

          <div v-if="images.length" class="mt-3 grid grid-cols-3 gap-3">
            <div
              v-for="(src, index) in images"
              :key="src"
              class="group relative aspect-[4/3] overflow-hidden rounded-xl bg-bg-raised"
            >
              <img :src="src" alt="" class="h-full w-full object-cover" />
              <button
                type="button"
                class="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-bg/85 text-[12px] text-fg backdrop-blur transition-opacity duration-300 hover:opacity-70"
                :aria-label="`删除第 ${index + 1} 张图片`"
                @click="removeImage(index)"
              >
                ✕
              </button>
            </div>
          </div>

          <label
            v-if="remaining > 0"
            class="mt-3 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-[13px] text-fg-subtle transition-colors duration-300 hover:border-fg hover:text-fg"
            :class="uploading || submitting ? 'pointer-events-none opacity-60' : ''"
          >
            <input
              type="file"
              accept="image/*"
              multiple
              class="sr-only"
              :disabled="uploading || submitting"
              @change="onFiles"
            />
            <span>{{ uploading ? '上传中…' : '添加图片' }}</span>
            <span class="text-[11px]">最多 {{ MAX_IMAGES }} 张</span>
          </label>
        </div>

        <p v-if="formError" class="text-[13px] leading-snug text-fg" role="alert" data-reveal>
          <span aria-hidden="true">—&nbsp;</span>{{ formError }}
        </p>

        <div class="flex items-center gap-4" data-reveal>
          <AppButton type="submit" size="lg" :loading="submitting" :disabled="uploading">
            {{ submitting ? '发布中…' : '发布' }}
          </AppButton>
          <AppButton variant="ghost" size="lg" to="/review">取消</AppButton>
        </div>
      </form>
    </section>
  </div>
</template>
