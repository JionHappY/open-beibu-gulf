import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

// echarts 全量 mock：本件只测生命周期接线（init 次数 / unmount dispose / chartRef 补初始化），
// 不测渲染。三条断言各对应 useECharts 里一处此前零覆盖的接线。
const { initMock, onThemeChangeMock, stopThemeWatchMock } = vi.hoisted(() => {
  const stopThemeWatchMock = vi.fn()
  return {
    initMock: vi.fn(),
    onThemeChangeMock: vi.fn(() => stopThemeWatchMock),
    stopThemeWatchMock,
  }
})

vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {} }))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  TooltipComponent: {},
}))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/core', () => ({ init: initMock, use: vi.fn() }))
vi.mock('@/shared', () => ({
  useTheme: () => ({ onThemeChange: onThemeChangeMock }),
  perfTimeFn: (_label: string, fn: () => void) => fn(),
}))

import { useECharts } from '../useECharts'

function makeInstance() {
  return {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }
}

/** 真组件上下文挂载（onMounted/onUnmounted 只在 setup 内有效，独立调用会被 Vue 丢弃） */
function mountHarness(initial: HTMLElement | null = null) {
  const chartRef = ref<HTMLElement | null>(initial)
  let api: ReturnType<typeof useECharts> | null = null
  const Harness = defineComponent({
    setup() {
      api = useECharts({ getOption: () => ({}), chartRef })
      return () => h('div')
    },
  })
  const wrapper = mount(Harness)
  return { wrapper, chartRef, getApi: () => api as ReturnType<typeof useECharts> }
}

describe('useECharts 生命周期接线（W8）', () => {
  // 调用计数是跨用例共享的全局 mock，必须逐例清空（否则上例的 init 会算进下例）
  beforeEach(() => {
    initMock.mockReset()
    initMock.mockImplementation(() => makeInstance())
    onThemeChangeMock.mockClear()
    stopThemeWatchMock.mockClear()
  })

  it('🔴 容器撤下再挂载：旧实例 dispose、新容器重新 init，主题订阅保留到卸载', async () => {
    const el1 = document.createElement('div')
    const inst1 = makeInstance()
    initMock.mockImplementationOnce(() => inst1)
    initMock.mockImplementation(() => makeInstance())
    const { wrapper, chartRef, getApi } = mountHarness(el1)
    expect(initMock).toHaveBeenCalledTimes(1) // onMounted

    chartRef.value = null
    await Promise.resolve()
    expect(inst1.dispose).toHaveBeenCalledTimes(1)
    expect(stopThemeWatchMock).not.toHaveBeenCalled()

    const el2 = document.createElement('div')
    chartRef.value = el2
    await Promise.resolve()
    expect(initMock).toHaveBeenCalledTimes(2)
    expect(getApi().getInstance()).not.toBeNull()
    expect(stopThemeWatchMock).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(stopThemeWatchMock).toHaveBeenCalledTimes(1)
  })

  it('🔴 卸载即 dispose 并退订主题（删 onUnmounted(disposeChart) 即红）', () => {
    const el = document.createElement('div')
    const inst = makeInstance()
    initMock.mockImplementation(() => inst)
    const { wrapper } = mountHarness(el)
    expect(initMock).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(inst.dispose).toHaveBeenCalledTimes(1)
    expect(stopThemeWatchMock).toHaveBeenCalledTimes(1)
  })

  it('🔴 chartRef 由空变非空时补初始化（删 watch(chartRef) 即红）', async () => {
    const el = document.createElement('div')
    initMock.mockImplementation(() => makeInstance())
    const { chartRef } = mountHarness(null)
    // onMounted 时容器还不存在（v-if 下 chartRef 为 null）⇒ 不初始化
    expect(initMock).not.toHaveBeenCalled()

    chartRef.value = el
    await Promise.resolve()
    expect(initMock).toHaveBeenCalledTimes(1)
  })
})
