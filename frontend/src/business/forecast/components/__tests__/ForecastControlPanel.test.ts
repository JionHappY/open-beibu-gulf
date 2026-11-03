// @vitest-environment jsdom

/**
 * ForecastControlPanel 时间轴契约测试（2026-11-01 用户定稿：年份轴裸露，不再点开才出现）：
 * ①默认渲染即有 input[type=range]，值=当前步（年月双基换算不变）；
 * ②滑块输入写 store.currentTime（步→时间串仍走 ../timeline）；
 * ③年/月粒度切换后步值与上界同步（既有换算行为不变）；
 * ④可点击刻度跳年（选择步进不变），刻度常驻；
 * ⑤滑块本体按下进入专注模式、松手退出（beginSliderFocus/endSliderFocus 保留）；
 * ⑥▶ 开始键撤除；挂载即自动播放；空格切换播放/暂停（输入框内不劫持）。
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, effectScope, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { useSliderFocus } from '@/core'
import { showToast } from '@/shared'

vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared')>()
  return { ...actual, showToast: vi.fn() }
})
import { useForecastStore } from '@/stores'

import { provideForecastOrchestrator } from '../../composables/useForecastOrchestrator'
import ForecastControlPanel from '../ForecastControlPanel.vue'

/** v4-S3：面板从页面 inject 编排器（缺提供即抛错，设计如此）——测件按真实拓扑注入桩。
 *  编排器 key 已收为模块内部（去 export），故经 provideForecastOrchestrator 真建实例后替换其
 *  doForecastUpdate 为桩：与 ForecastPage.vue 的 provide 路径同形，且注入靠组件树而非 key 字面量。 */
const doForecastUpdate = vi.fn(() => Promise.resolve())
let router: Router
function mountPanel(attach = false) {
  const Parent = defineComponent({
    setup() {
      const orchestrator = provideForecastOrchestrator({ updateForecastLayer: async () => {} })
      orchestrator.doForecastUpdate = doForecastUpdate
      return () => h(ForecastControlPanel)
    },
  })
  return mount(Parent, {
    attachTo: attach ? document.body : undefined,
    global: { plugins: [router] },
  })
}

/** 时间轴：裸露的 range（不点开就能拖，2026-11-01 用户定稿） */
function timeRange(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('input.time-range')
}

describe('ForecastControlPanel 时间轴（裸露滑块）', () => {
  let originalWidth = 0

  beforeEach(async () => {
    setActivePinia(createPinia())
    router = createRouter({ history: createMemoryHistory(), routes: [] })
    await router.push('/')
    await router.isReady()
    originalWidth = window.innerWidth
    // 专注模式仅在 <960px 抽屉档生效（桌面档 beginSliderFocus 主动 return）
    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      value: originalWidth,
      writable: true,
      configurable: true,
    })
    vi.useRealTimers()
  })

  it('默认渲染即有 range 滑块，值=当前步、上界=月模式上限、文案=当前时间', () => {
    const wrapper = mountPanel()

    const sliders = wrapper.findAll('input[type="range"]')
    expect(sliders).toHaveLength(1)
    expect((sliders[0].element as HTMLInputElement).value).toBe('65')
    expect(sliders[0].attributes('min')).toBe('0')
    expect(sliders[0].attributes('max')).toBe('131')
    expect(sliders[0].attributes('step')).toBe('1')
    expect(wrapper.find('.time-bubble').text()).toBe('2026年06月')

    wrapper.unmount()
  })

  it('滑块输入写 store.currentTime，文案同步（月模式步→时间串）', async () => {
    const wrapper = mountPanel()
    const store = useForecastStore()

    await timeRange(wrapper).setValue('12')

    expect(store.currentTime).toBe('2022-01')
    expect(wrapper.find('.time-bubble').text()).toBe('2022年01月')

    wrapper.unmount()
  })

  it('可点击刻度常驻（滑块未展开这一前置不复存在），跳年步进保留', async () => {
    const wrapper = mountPanel()
    const store = useForecastStore()

    const ticks = wrapper.findAll('.t-tick.clickable')
    expect(ticks.map((t) => t.text())).toEqual(['2021.1', '2026.1', '2031.1'])

    await ticks[2].trigger('click')

    expect(store.currentTime).toBe('2031-01')
    wrapper.unmount()
  })

  it('滑块本体按下进入专注模式、松手退出（专注模式保留）', async () => {
    const wrapper = mountPanel(true)
    const scope = effectScope()
    const sliderFocus = scope.run(() => useSliderFocus())!

    const slider = timeRange(wrapper)
    slider.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(sliderFocus.active.value).toBe(true)

    slider.element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(sliderFocus.active.value).toBe(false)

    wrapper.unmount()
    scope.stop()
  })

  it('时间气泡：文案=当前时间，位置随滑块变化（不常驻：显示与否由 CSS 悬停/聚焦控制）', async () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.time-now').exists()).toBe(false)
    const bubble = wrapper.find('.time-bubble')
    expect(bubble.exists()).toBe(true)
    expect(bubble.text()).toBe('2026年06月')
    const before = (wrapper.find('.time-card').element as HTMLElement).style.getPropertyValue(
      '--pos'
    )

    await timeRange(wrapper).setValue('12')
    expect(wrapper.find('.time-bubble').text()).toBe('2022年01月')
    const after = (wrapper.find('.time-card').element as HTMLElement).style.getPropertyValue(
      '--pos'
    )
    expect(after).not.toBe(before)

    wrapper.unmount()
  })

  it('▶ 开始键已撤：面板内不存在播放按钮/播放按钮容器', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.time-acts').exists()).toBe(false)
    expect(wrapper.findAll('button.act-btn')).toHaveLength(0)

    wrapper.unmount()
  })

  it('默认自动播放：挂载即 isPlaying，且按 playSpeed 推进时间', async () => {
    vi.useFakeTimers()
    const wrapper = mountPanel()
    const store = useForecastStore()

    expect(store.isPlaying).toBe(true)
    const before = store.currentTime
    await vi.advanceTimersByTimeAsync(store.playSpeed)

    expect(store.currentTime).not.toBe(before)
    wrapper.unmount()
  })

  it('空格切换播放/暂停；在输入框内不劫持', async () => {
    const wrapper = mountPanel(true)
    const store = useForecastStore()

    const playing = store.isPlaying
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(store.isPlaying).toBe(!playing)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(store.isPlaying).toBe(playing)

    // 输入框里按空格是"输入空格"，不是播放控制
    const input = timeRange(wrapper).element as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(store.isPlaying).toBe(playing)

    wrapper.unmount()
  })
})

describe('ForecastControlPanel 请求归属（v4-S3）', () => {
  // ── v4-S3：请求归属上移后，"用户改了什么"由本面板发起（判据在防抖窗口上） ──
  it('参数变化经 300ms 防抖调用一次编排器（连续两次变化只发一次）', async () => {
    vi.useFakeTimers()
    try {
      doForecastUpdate.mockClear()
      // 必须卸载：默认自动播放的 interval 会跨用例继续写时间（泄漏面板会污染后续断言）
      const wrapper = mountPanel()
      const store = useForecastStore()

      store.setCurrentTime('2027-01')
      store.setCurrentTime('2028-01')
      await vi.advanceTimersByTimeAsync(0)
      expect(doForecastUpdate).not.toHaveBeenCalled() // 防抖窗口内不发起

      await vi.advanceTimersByTimeAsync(300)
      expect(doForecastUpdate).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('卸载后防抖窗口内的那一次不再发起（与页面 cancelAll 互补）', async () => {
    vi.useFakeTimers()
    try {
      doForecastUpdate.mockClear()
      const wrapper = mountPanel()
      useForecastStore().setCurrentTime('2027-06')
      // 先让 pre-flush 的 watch 回调落地（防抖计时器真的被登记），再卸载才有「撤销」可验
      await nextTick()

      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(400)
      expect(doForecastUpdate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── F4：运河情景芯片——仅 cargo 有文献锚点，非 cargo 指标禁用非基线档 ──
describe('ForecastControlPanel 运河情景芯片（F4）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    router = createRouter({ history: createMemoryHistory(), routes: [] })
    await router.push('/')
    await router.isReady()
  })

  it('cargo 下四档可选：点「中位」写 store.canalScenario（阳性对照）', async () => {
    const wrapper = mountPanel()
    const store = useForecastStore()

    const chips = wrapper.findAll('button.scenario-chip')
    expect(chips.map((c) => c.text())).toEqual(['基线', '设计', '中位', '诱导'])
    expect(store.canalScenario).toBe('baseline')
    expect(wrapper.find('.scenario-row').classes()).not.toContain('off')

    await chips[2].trigger('click')
    expect(store.canalScenario).toBe('median')

    wrapper.unmount()
  })

  it('非 cargo 指标：非基线三档 disabled 且点击不改 store', async () => {
    const wrapper = mountPanel()
    const store = useForecastStore()
    store.setActiveIndicator('container')
    await nextTick()

    const chips = wrapper.findAll('button.scenario-chip')
    expect(chips.map((c) => (c.element as HTMLButtonElement).disabled)).toEqual([
      false,
      true,
      true,
      true,
    ])
    expect(wrapper.find('.scenario-row').classes()).toContain('off')

    await chips[1].trigger('click')
    await chips[2].trigger('click')
    expect(store.canalScenario).toBe('baseline')

    wrapper.unmount()
  })
})
// W17：热力散射点的空间分布是示意性插值（每港 40 点按距离衰减铺在港口周围），
// 此前只在后端 forecast-engine.ts 的注释里说明，UI 零披露 ⇒ 用户会把热力面读成实测点位。
describe('ForecastControlPanel 空间口径披露（W17，改为 toast）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    router = createRouter({ history: createMemoryHistory(), routes: [] })
    await router.push('/')
    await router.isReady()
    sessionStorage.removeItem('gcs.forecast.hint')
    vi.mocked(showToast).mockClear()
  })

  it('进入面板即以 toast 披露「空间分布是示意性插值、非实测」，且不再常驻脚注', () => {
    const wrapper = mountPanel()

    // 常驻脚注已撤（用户 2026-11-01：提示走 toast，别占位）
    expect(wrapper.find('.forecast-note').exists()).toBe(false)

    const texts = vi.mocked(showToast).mock.calls.map((c) => String(c[0]))
    const hit = texts.find((t) => t.includes('空间分布'))
    expect(hit).toBeTruthy()
    // 只钉承重三段：披露对象、性质、否定项——不钉整句措辞（AGENTS §5.3 第三式）
    expect(hit).toContain('示意')
    expect(hit).toContain('非实测')

    wrapper.unmount()
  })

  it('同一会话只提示一次（sessionStorage 去重）', () => {
    mountPanel().unmount()
    const first = vi.mocked(showToast).mock.calls.length
    expect(first).toBeGreaterThan(0)

    mountPanel().unmount()
    expect(vi.mocked(showToast).mock.calls.length).toBe(first)
  })
})

// D3 去 export：FORECAST_ORCHESTRATOR_KEY 已收为模块内部；本组是「公开面收窄」本身的判据。
describe('公开面收窄 — FORECAST_ORCHESTRATOR_KEY 不得再导出', () => {
  const INTERNAL = ['FORECAST_ORCHESTRATOR_KEY']

  it('内部符号不在模块公开面；公开符号仍在（阳性对照）', async () => {
    const mod = (await import('../../composables/useForecastOrchestrator')) as unknown as Record<
      string,
      unknown
    >
    for (const k of INTERNAL) expect(mod[k], k + ' 应已收为模块内部').toBeUndefined()
    expect(typeof mod.provideForecastOrchestrator).toBe('function')
  })
})

/**
 * 指标卡 2×2（2026-11-01 用户定稿）：
 * 「不要用左右阅读的，没有四个按钮，你就在业务里凑出来第四个指标用来做按钮」——
 * 四格两列自上而下；第四格是同比增速视图（不是第四个数据指标）。
 */
describe('自动播放与后台标签页', () => {
  let originalWidth = 0
  beforeEach(async () => {
    setActivePinia(createPinia())
    router = createRouter({ history: createMemoryHistory(), routes: [] })
    await router.push('/')
    await router.isReady()
    originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true })
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'innerWidth', {
      value: originalWidth,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  })

  it('标签页隐藏时不推进时间轴（每推进一帧就发一次请求）', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    const wrapper = mountPanel()
    const store = useForecastStore()
    vi.advanceTimersByTime(200)
    const before = store.currentTime
    vi.advanceTimersByTime(2000)
    expect(store.currentTime).toBe(before)
    expect(store.isPlaying).toBe(true)
    wrapper.unmount()
  })

  it('阳性对照：可见时同一时间段内会推进', () => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    const wrapper = mountPanel()
    const store = useForecastStore()
    vi.advanceTimersByTime(200)
    const before = store.currentTime
    vi.advanceTimersByTime(2000)
    expect(store.currentTime).not.toBe(before)
    wrapper.unmount()
  })
})

describe('ForecastControlPanel 指标卡（2×2 四格）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    router = createRouter({ history: createMemoryHistory(), routes: [] })
    await router.push('/')
    await router.isReady()
  })

  it('渲染 4 张卡，标签顺序为 货物/集装箱/活跃度/同比增速', () => {
    const wrapper = mountPanel()
    const cells = wrapper.findAll('.btn-cell')
    expect(cells).toHaveLength(4)
    expect(cells.map((c) => c.text())).toEqual([
      expect.stringContaining('货物'),
      expect.stringContaining('集装箱'),
      expect.stringContaining('港口吞吐活跃度'),
      expect.stringContaining('同比增速'),
    ])
    wrapper.unmount()
  })

  it('指标卡状态显示情景系数「×0.80」而不是概率百分比', () => {
    // 后端把这个参数当情景系数用（forecast-engine.ts:76 `1 + avgAnnualGrowth * scenarioLevel`），
    // 不是置信区间：显示成「80%」会被读成概率，故钉住单位写法
    const wrapper = mountPanel()
    const stateText = wrapper.findAll('.btn-cell')[0].text()
    expect(stateText).toContain('×0.80')
    expect(stateText).not.toContain('%')
    wrapper.unmount()
  })

  it('点「同比增速」开增速视图，再点关回去（不切换 activeIndicator）', async () => {
    const wrapper = mountPanel()
    const store = useForecastStore()
    const growth = wrapper.findAll('.btn-cell')[3]

    await growth.find('.ssc').trigger('click')
    expect(store.growthMode).toBe(true)
    expect(store.activeIndicator).toBe('cargo')

    await growth.find('.ssc').trigger('click')
    expect(store.growthMode).toBe(false)
    wrapper.unmount()
  })

  it('增速视图下点任一真指标 ⇒ 增速退出（阳性：否则两张图口径打架）', async () => {
    const wrapper = mountPanel()
    const store = useForecastStore()
    store.setGrowthMode(true)

    await wrapper.findAll('.btn-cell')[1].find('.ssc').trigger('click')
    expect(store.growthMode).toBe(false)
    expect(store.activeIndicator).toBe('container')
    wrapper.unmount()
  })
})
