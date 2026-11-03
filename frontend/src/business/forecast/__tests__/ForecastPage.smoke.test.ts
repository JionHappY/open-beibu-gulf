// @vitest-environment jsdom
/**
 * ForecastPage 挂载冒烟测试（2026-08-11：页面级 0 覆盖补充）
 * 目标：页面在真实 Pinia + mock 外部依赖下可挂载/卸载不抛错，
 * 关键子组件渲染到位（shallowMount stub 子组件，只验证页面自身装配逻辑）。
 */
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useForecastStore, useMapStore } from '@/stores'

const h = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  runInTransaction: vi.fn((fn: () => unknown) => fn()),
  startTransaction: vi.fn((): { transactionId: number; signal: AbortSignal } => ({
    transactionId: 1,
    signal: new AbortController().signal,
  })),
  isTransactionValid: vi.fn(() => true),
  cancelAll: vi.fn(),
  updateForecastLayer: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))

vi.mock('@/business/forecast/composables/useForecastRequest', () => ({
  useForecastRequest: () => ({
    runInTransaction: h.runInTransaction,
    startTransaction: h.startTransaction,
    isTransactionValid: h.isTransactionValid,
    cancelAll: h.cancelAll,
  }),
  // 冒烟测试里真实 adapter 必失败（jsdom 无网络）⇒ 错误分支会调用它；
  // 漏掉这个导出会让 catch 里再抛 TypeError，变成 unhandled rejection。
  guardForecastAuth: () => false,
}))

vi.mock('@/business/forecast/composables/useForecastLayer', () => ({
  useForecastLayer: () => ({
    updateForecastLayer: h.updateForecastLayer,
    renderer: { value: null },
  }),
}))

// mock useApiRequest 子模块（入口 @/shared 的 re-export 会解析到 mock）。
// token/setToken/clearToken 必须补齐：真实 useAuth 顶层从此处解构 token，
// 缺失会让 useFavorites 模块顶层 watch([user, token]) 拿到 undefined
//（「Invalid watch source」Vue warn）
// 保留真实导出（ApiError 等）：errorHandler 用 instanceof 判类型，
// 只替换 useApiRequest 会让 ApiError 变成 undefined，错误分支再抛一次。
vi.mock('@/shared/composables/useApiRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/composables/useApiRequest')>()
  const { ref } = await import('vue')
  return {
    ...actual,
    useApiRequest: () => ({
      apiRequest: h.apiRequest,
      token: ref(''),
      setToken: vi.fn(),
      clearToken: vi.fn(),
    }),
  }
})

import ForecastPage from '../ForecastPage.vue'

describe('ForecastPage 冒烟', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    h.apiRequest.mockResolvedValue({
      code: 200,
      data: { timeseries: [], series: [], indicators: [] },
    })
  })

  it('挂载渲染成功且不抛错（onMounted 仅消费快照/重置）', async () => {
    const wrapper = shallowMount(ForecastPage)
    expect(wrapper.exists()).toBe(true)
    // 页面根容器渲染
    expect(wrapper.find('.forecast-page').exists()).toBe(true)
    wrapper.unmount()
  })

  // v4-S3：页面侧只剩"渲染器就绪"这一次初始化触发；卸载必须取消在飞请求
  it('渲染器未就绪不发起；卸载调用 cancelAll', async () => {
    const wrapper = shallowMount(ForecastPage)

    expect(h.startTransaction).not.toHaveBeenCalled() // currentRenderer 为 null ⇒ 编排器空转
    wrapper.unmount()
    expect(h.cancelAll).toHaveBeenCalled()
  })

  // 回归：SPA 导航进入时地图已就绪，immediate watch 会在 setup 阶段发请求；
  // 若 reset() 仍留在 onMounted（晚于 setup），会把刚发起的事务 ID 清零，
  // 响应回来被 isTransactionValid 判过期而丢弃 —— 表现为预测页两张图恒「暂无数据」。
  it('渲染器已就绪时 SPA 进入：事务 ID 不被挂载后 reset 清零', async () => {
    const mapStore = useMapStore()
    const forecastState = useForecastStore()
    mapStore.currentRenderer = {} as never
    h.startTransaction.mockImplementation(() => ({
      transactionId: forecastState.bumpTransactionId(),
      signal: new AbortController().signal,
    }))

    const wrapper = shallowMount(ForecastPage)
    await wrapper.vm.$nextTick()

    expect(h.startTransaction).toHaveBeenCalled()
    expect(forecastState.activeTransactionId).toBeGreaterThan(0)
    wrapper.unmount()
  })
})
