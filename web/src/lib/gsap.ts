import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Flip } from 'gsap/Flip'
import { SplitText } from 'gsap/SplitText'

/**
 * GSAP 3.13 起（Webflow 收购后）全部插件开源免费，这里把要用的都注册上。
 *
 * - ScrollTrigger  滚动叙事、视差、入viewport 触发
 * - Flip           共享元素转场（列表卡片 → 详情页 hero）
 * - SplitText      标题逐字/逐行入场
 *
 * 全部走同一个 ticker，与 Lenis 天然同步，不需要额外的 rAF 协调。
 */
gsap.registerPlugin(ScrollTrigger, Flip, SplitText)

/** 统一缓动，和 CSS 侧的 --ease-cinematic 是同一条曲线的观感 */
gsap.defaults({ ease: 'expo.out', duration: 0.9 })

export { gsap, ScrollTrigger, Flip, SplitText }
