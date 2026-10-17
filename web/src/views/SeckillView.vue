<script setup lang="ts">
/**
 * 限时抢购 `/seckill/:id`。**`:id` 是车 id，不是券 id。**
 *
 * ── 为什么 URL 里放车 id ───────────────────────────────────────────────
 *
 * 后端没有「按券 id 查券」的接口，只有 `GET /voucher/list/{shopId}`（shopId = 车 id）。
 * 若 URL 用券 id，刷新页面时就无从知道该去哪张券所属的车，只能靠会话传递 ——
 * 那样这个页面就不可深链、不可刷新、不可分享。用车的 id，一切都从 URL 推得出来。
 *
 * ── 这一页最容易写错的地方：把「已受理」说成「已成功」────────────────────
 *
 * 后端这条路径是**异步**的（Lua 扣库存 → 消息投进 Redis Stream → 立刻返回订单号），
 * 真正的建单由消费者线程去做。也就是说拿到订单号的那一刻，**数据库里还没有这行**。
 *
 * 所以成功态说的是「下单请求已受理 / 订单正在生成」，并且不给「去查看订单」的入口 ——
 * 后端根本没有订单查询接口。写成「已购买成功 ✓」的后果是用户马上去个人中心找一个
 * 十分钟后才出现的订单，然后认为系统吞了他的钱。
 *
 * ── 三条失败信息就是后端那三条，没有第四条 ──────────────────────────────
 *
 * `库存不足` / `禁止重复下单` / `优惠券不存在或库存未预热`（`SECKILL_ERRORS`）。
 * **没有「秒杀尚未开始 / 已结束」** —— 那两个字符串在后端被注释掉的同步实现里，
 * 线上路径不校验时间窗。这一页的「未开始 / 已结束」是**前端自己**的判据
 * （`isSeckillLive`，更严），目的是不给出一个点下去会成功的过期按钮。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NeedLoginError } from '@/api/client'
import { fetchCarDetail, fetchVouchersOfShop, isSeckillLive } from '@/api/car'
import { SECKILL_ERRORS, seckill } from '@/api/order'
import type { Car, Voucher } from '@/api/types'
import { formatCount } from '@/composables/useCountUp'
import { useReveal } from '@/composables/useReveal'
import { formatRemaining, monthDay, remainingUntil } from '@/lib/time'
import { useAuthStore } from '@/stores/auth'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import AppButton from '@/components/ui/AppButton.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const car = ref<Car | null>(null)
const vouchers = ref<Voucher[]>([])
const loaded = ref(false)

const pageRoot = ref<HTMLElement | null>(null)
useReveal(pageRoot, { children: true, stagger: 0.09, y: 26, ready: loaded })

/* ── 走动的时钟 ──────────────────────────────────────────────────────────
 *
 * 「限时」这两个字要求秒数真的会动。`VoucherCards` 里的 `now` 是挂载时的常量，
 * 于是「剩余时间」在一张打开着的页面上是死的 —— 这一页不再犯那个错。
 * 每秒一次重算，只驱动几个 computed，代价可以忽略。
 */
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

/** 只管 `type = 1` 的秒杀券；普通券在详情页的区块里展示，这里不重复 */
const seckillVouchers = computed(() => vouchers.value.filter((v) => v.type === 1))
const liveVouchers = computed(() => seckillVouchers.value.filter((v) => isSeckillLive(v, now.value)))

/**
 * 选中的券。多于一张时由用户切换；默认选**第一张此刻可抢的**，
 * 一张可抢的都没有时退回第一张（好让页面能解释「已结束」而不是空着）。
 *
 * 注意声明顺序：`liveVouchers` 必须在 `selected` **之前**。computed 的求值是惰性的，
 * 反过来写运行期也能跑，但一旦有人在 setup 阶段同步读一次 `selected.value`
 * 就会撞上 TDZ —— 让顺序本身就正确，别依赖惰性。
 */
const selectedId = ref<number | null>(null)
const selected = computed(() => {
  const list = seckillVouchers.value
  return list.find((v) => v.id === selectedId.value) ?? liveVouchers.value[0] ?? list[0]
})

const remainingMs = computed(() => remainingUntil(selected.value?.endTime, now.value))
const beginInMs = computed(() => remainingUntil(selected.value?.beginTime, now.value))

/**
 * 这一场处于哪个阶段。**三态而不是「能买 / 不能买」两态** ——
 * 「还没开始」和「已经结束」对用户是两件不同的事，两态写法必然让其中一个
 * 显示错的文案（倒计时说「未开始」、按钮说「已结束」，同屏自相矛盾）。
 */
type Phase = 'upcoming' | 'live' | 'ended'
const phase = computed<Phase>(() => {
  const v = selected.value
  if (!v) return 'ended'
  if (beginInMs.value > 0) return 'upcoming'
  return isSeckillLive(v, now.value) ? 'live' : 'ended'
})

const canBuy = computed(() => phase.value === 'live')

/* ── 下单结果 ────────────────────────────────────────────────────────────
 *
 * 用一个显式的联合类型而不是几个布尔量：几个 `isSuccess` / `isSoldOut` 布尔量
 * 可以组合出「同时又成功又售罄」这种不存在的状态，而联合类型在类型层面就排除了。
 */
type Outcome =
  | { kind: 'idle' }
  | { kind: 'pending'; orderId: number }
  | { kind: 'duplicated' }
  | { kind: 'soldOut' }
  | { kind: 'notWarmed' }
  | { kind: 'error'; message: string }

const outcome = ref<Outcome>({ kind: 'idle' })
const submitting = ref(false)

const yuan = (fen: number) => formatCount(fen / 100, 0)

/** 把后端的错误字面量翻译成下单结果。**判据是字符串本身**，所以要常量比对 */
function outcomeFromMessage(msg: string): Outcome {
  if (msg === SECKILL_ERRORS.duplicated) return { kind: 'duplicated' }
  if (msg === SECKILL_ERRORS.soldOut) return { kind: 'soldOut' }
  if (msg === SECKILL_ERRORS.notWarmed) return { kind: 'notWarmed' }
  return { kind: 'error', message: msg }
}

async function onBuy(): Promise<void> {
  const voucher = selected.value
  if (!voucher) return

  // 未登录先去登录，并带上回程。用当前完整路径，登录后回到同一张券上
  if (!auth.isLoggedIn) {
    await router.push({ name: 'login', query: { next: route.fullPath } })
    return
  }

  submitting.value = true
  outcome.value = { kind: 'idle' }
  try {
    const { orderId } = await seckill(voucher.id)
    outcome.value = { kind: 'pending', orderId }
  } catch (err) {
    // 登录过期：走与全局 401 处理同一条路（后端 token 有 30 分钟滑动过期，
    // 挂着页面不动的用户会碰上）
    if (err instanceof NeedLoginError) {
      auth.forget()
      await router.push({ name: 'login', query: { next: route.fullPath } })
      return
    }
    outcome.value = outcomeFromMessage(err instanceof Error ? err.message : '下单失败')
  } finally {
    submitting.value = false
  }
}

/* 时钟与数据加载共用一个 onMounted：两处分开写会让人以为它们有先后依赖 */
onMounted(async () => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)

  const id = Number(route.params.id)
  if (!Number.isFinite(id)) {
    loaded.value = true
    return
  }

  const found = await fetchCarDetail(id)
  car.value = found ?? null
  // 车不存在就不必再问券了 —— 少一次注定为空的请求
  if (found) vouchers.value = await fetchVouchersOfShop(found.id)

  loaded.value = true
})

onUnmounted(() => {
  if (ticker !== null) clearInterval(ticker)
})
</script>

<template>
  <div ref="pageRoot">
    <!-- 骨架照真实两栏构图，加载完不跳 -->
    <div v-if="!loaded" class="pt-[4.5rem]">
      <div class="mx-auto max-w-[1440px] px-8 pt-10 pb-4 lg:px-16">
        <div class="grid grid-cols-1 gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <SkeletonBlock rounded="rounded-[1.5rem]" class="aspect-[4/3]" />
          <div class="space-y-5">
            <SkeletonBlock rounded="rounded-md" class="h-3 w-24" />
            <SkeletonBlock rounded="rounded-md" class="h-12 w-3/4" />
            <SkeletonBlock rounded="rounded-md" class="h-16 w-1/2" />
            <SkeletonBlock rounded="rounded-full" class="h-14 w-full" />
          </div>
        </div>
      </div>
    </div>

    <section
      v-else-if="!car"
      class="mx-auto flex min-h-[70svh] max-w-[1440px] flex-col justify-center px-8 lg:px-16"
    >
      <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">Not found</p>
      <h1
        class="mt-5 text-[clamp(1.75rem,4vw,2.75rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
      >
        没有找到这台车
      </h1>
      <p class="mt-5 max-w-[30rem] text-[14px] leading-[1.9] text-fg-muted">
        它可能已经售出或下架了。
      </p>
      <div class="mt-9">
        <AppButton to="/cars">看看其他车源</AppButton>
      </div>
    </section>

    <!-- 车在、但没有秒杀券：说清楚是「这台车没有」而不是「抢完了」 -->
    <section
      v-else-if="!selected"
      class="mx-auto flex min-h-[70svh] max-w-[1440px] flex-col justify-center px-8 lg:px-16"
    >
      <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">No offer</p>
      <h1
        class="mt-5 text-[clamp(1.75rem,4vw,2.75rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
      >
        这台车暂无限时特价
      </h1>
      <p class="mt-5 max-w-[30rem] text-[14px] leading-[1.9] text-fg-muted">
        可以先去车辆详情页看看车况与参数。
      </p>
      <div class="mt-9">
        <AppButton :to="`/car/${car.id}`">查看车辆详情</AppButton>
      </div>
    </section>

    <div v-else class="pt-[4.5rem]">
      <div class="mx-auto max-w-[1440px] px-8 pt-10 pb-24 lg:px-16">
        <div class="grid grid-cols-1 gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <!-- 左：车 -->
          <div data-reveal>
            <div class="aspect-[4/3] overflow-hidden rounded-[1.5rem] border border-line bg-bg-raised">
              <img
                v-if="car.images.length"
                :src="car.images[0]"
                :alt="car.name"
                class="h-full w-full object-cover"
              />
            </div>
            <h1
              class="mt-7 text-[clamp(1.5rem,2.6vw,2rem)] leading-tight font-semibold tracking-[-0.03em] text-fg"
            >
              {{ car.name }}
            </h1>
            <p class="tnum mt-3 text-[13px] text-fg-muted">
              {{ car.brand }}
              <template v-if="car.registerDate"> · {{ car.registerDate }} 上牌</template>
              <template v-if="car.mileage != null"> · {{ car.mileage }} 万公里</template>
            </p>
            <p class="mt-5 text-[14px] leading-[1.9] text-fg-muted">{{ car.address }}</p>
          </div>

          <!-- 右：抢购面板 -->
          <div class="lg:pt-2" data-reveal>
            <p class="font-display text-[12px] tracking-[0.3em] text-fg-subtle uppercase">
              Limited offer
            </p>

            <!-- 多于一张时给出选择。用原生 radio 而不是按钮组：键盘与读屏直接可用 -->
            <fieldset v-if="seckillVouchers.length > 1" class="mt-6">
              <legend class="sr-only">选择优惠券</legend>
              <div class="flex flex-col gap-2">
                <label
                  v-for="v in seckillVouchers"
                  :key="v.id"
                  class="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-300"
                  :class="selected?.id === v.id ? 'border-fg' : 'border-line hover:border-fg-subtle'"
                >
                  <input
                    v-model="selectedId"
                    type="radio"
                    name="voucher"
                    :value="v.id"
                    class="sr-only"
                  />
                  <span class="min-w-0 flex-1 truncate text-[14px] text-fg">{{ v.title }}</span>
                  <span class="tnum shrink-0 text-[13px] text-fg-muted">
                    ¥{{ yuan(v.actualValue) }}
                  </span>
                </label>
              </div>
            </fieldset>

            <h2
              class="mt-6 text-[clamp(1.25rem,2.2vw,1.75rem)] leading-tight font-semibold tracking-[-0.02em] text-fg"
            >
              {{ selected.title }}
            </h2>

            <!-- 价格口径与 `VoucherCards` / `StickyBuyBar` 逐字一致：
                 `¥{payValue} 抵 ¥{actualValue}`。**不能写成「¥actualValue + payValue 划线」**
                 —— 划线读作「原价」，而 payValue 是你要付的钱、actualValue 是它抵掉的金额，
                 把 ¥99 划掉挂在 ¥10000 旁边读起来像「涨价」。
                 `payValue` 为 0 时不写「¥0 抵」：0 元券读起来像 bug（同 VoucherCards）。 -->
            <p class="tnum mt-6 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <template v-if="selected.payValue > 0">
                <span class="text-[15px] text-fg-muted">¥{{ yuan(selected.payValue) }}</span>
                <span class="text-[13px] text-fg-subtle">抵</span>
              </template>
              <span
                class="text-[clamp(2rem,4vw,3rem)] leading-none font-semibold tracking-[-0.03em] text-fg"
              >
                ¥{{ yuan(selected.actualValue) }}
              </span>
            </p>

            <!-- 倒计时 / 剩余库存 -->
            <dl class="mt-8 border-t border-line">
              <div class="flex items-baseline justify-between gap-6 border-b border-line py-4">
                <dt class="text-[13px] text-fg-muted">
                  {{ phase === 'upcoming' ? '距开始' : '距结束' }}
                </dt>
                <dd class="tnum text-[14px] font-medium text-fg">
                  {{ phase === 'upcoming' ? formatRemaining(beginInMs) : formatRemaining(remainingMs) }}
                </dd>
              </div>
              <div
                v-if="selected.stock != null"
                class="flex items-baseline justify-between gap-6 border-b border-line py-4"
              >
                <dt class="text-[13px] text-fg-muted">剩余</dt>
                <dd class="tnum text-[14px] font-medium text-fg">{{ selected.stock }} 张</dd>
              </div>
              <div
                v-if="selected.endTime"
                class="flex items-baseline justify-between gap-6 border-b border-line py-4"
              >
                <dt class="text-[13px] text-fg-muted">截止</dt>
                <dd class="tnum text-[14px] font-medium text-fg">
                  {{ monthDay(selected.endTime) }}
                </dd>
              </div>
            </dl>

            <p
              v-if="selected.rules"
              class="mt-6 text-[13px] leading-[1.9] whitespace-pre-line text-fg-muted"
            >
              {{ selected.rules }}
            </p>

            <!-- 按钮区。不可抢时**不隐藏操作**，而是把「为什么不能抢」和出路一起给出来 -->
            <div class="mt-9">
              <AppButton
                v-if="canBuy"
                size="lg"
                block
                type="button"
                :loading="submitting"
                @click="onBuy"
              >
                <!-- 文案随表单状态走，不只是变淡：`:loading` 只改透明度，
                     用户得知道「已经点了」。 -->
                {{ submitting ? '提交中…' : '立即抢购' }}
              </AppButton>
              <template v-else>
                <AppButton size="lg" block disabled>
                  {{ phase === 'upcoming' ? '尚未开始' : '本场已结束' }}
                </AppButton>
                <p class="mt-4 text-[13px] leading-relaxed text-fg-muted">
                  <template v-if="phase === 'upcoming'">
                    这一场还没开始，到点后回来即可。
                  </template>
                  <template v-else-if="liveVouchers.length">
                    这张券已经结束，但车上还有正在进行的场次，切换看看。
                  </template>
                  <template v-else> 车上所有限时特价都已结束，没有可抢的场次。 </template>
                  <RouterLink :to="`/car/${car.id}`" class="underline underline-offset-4">
                    去车辆详情页
                  </RouterLink>
                </p>
              </template>
            </div>

            <!-- ── 五种结果。措辞都是事实描述，不替后端下结论 ────────────── -->
            <div
              v-if="outcome.kind !== 'idle'"
              class="mt-8 rounded-[1.25rem] border border-line bg-bg-raised p-6"
              role="status"
            >
              <template v-if="outcome.kind === 'pending'">
                <p class="text-[14px] font-medium text-fg">下单请求已受理</p>
                <p class="tnum mt-2 text-[22px] leading-none font-semibold tracking-tight text-fg">
                  No. {{ outcome.orderId }}
                </p>
                <p class="mt-4 text-[13px] leading-relaxed text-fg-muted">
                  订单正在生成。后端是异步建单，此刻这行记录还没写进数据库，所以页面只能说到
                  「已受理」。稍后可在个人中心查看。
                </p>
              </template>

              <template v-else-if="outcome.kind === 'duplicated'">
                <p class="text-[14px] font-medium text-fg">你已经抢到过这张券了</p>
                <p class="mt-3 text-[13px] leading-relaxed text-fg-muted">
                  同一账号对同一张券只能下一单（一人一单）。换一张券或者换台车看看。
                </p>
              </template>

              <template v-else-if="outcome.kind === 'soldOut'">
                <p class="text-[14px] font-medium text-fg">这一场抢完了</p>
                <p class="mt-3 text-[13px] leading-relaxed text-fg-muted">
                  库存已被抢空。页面上的剩余数量是加载时的快照，以提交结果为准。
                </p>
              </template>

              <template v-else-if="outcome.kind === 'notWarmed'">
                <p class="text-[14px] font-medium text-fg">这张券暂时不可抢</p>
                <p class="mt-3 text-[13px] leading-relaxed text-fg-muted">
                  后端没有它的库存记录（券不存在，或库存还没预热）。这不是你的操作问题，
                  稍后再试或换一张券。
                </p>
              </template>

              <template v-else>
                <p class="text-[14px] font-medium text-fg">下单没成功</p>
                <p class="mt-3 text-[13px] leading-relaxed text-fg-muted">{{ outcome.message }}</p>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
