// @vitest-environment jsdom
/**
 * PlansPanel 的「代次守卫」与方案操作判据。
 *
 * 这个面板此前行覆盖 42.7%，最关键的一段——`plansLoadGeneration`——没有任何判据：
 * 登出/切账号后，上一账号在途的 getPlans 响应如果照样落地，A 的方案清单会渲染在
 * B 的屏幕上（读侧串账号）。删除/重命名后必须重新拉取、失败必须走全局 toast 而不是
 * 留在面板里，也都是只能靠用例钉住的契约。
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const h = vi.hoisted(() => ({
  user: null as unknown as { value: { id: string } | null },
  favorites: null as unknown as { value: unknown[] },
  loading: null as unknown as { value: boolean },
  deleting: null as unknown as { value: boolean },
  getPlans: vi.fn(),
  deletePlan: vi.fn(),
  updatePlan: vi.fn(),
  cancel: vi.fn(),
  showModal: vi.fn(),
  showError: vi.fn(),
  showToast: vi.fn(),
  removeFavorite: vi.fn(),
  saveState: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useAuth: () => ({ user: h.user }),
    usePlans: () => ({
      updatePlan: h.updatePlan,
      getPlans: h.getPlans,
      deletePlan: h.deletePlan,
      cancel: h.cancel,
      loading: h.loading,
      deleting: h.deleting,
    }),
    useFavorites: () => ({ favorites: h.favorites, removeFavorite: h.removeFavorite }),
    showModal: h.showModal,
    showError: h.showError,
    showToast: h.showToast,
  }
})

vi.mock('@/stores', () => ({
  useFloodStore: () => ({ saveState: h.saveState }),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: h.push }) }))

const { default: PlansPanel } = await import('../PlansPanel.vue')

function plan(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: '钦州港选址方案',
    businessType: 'site',
    savedXiaoqu: [],
    typeSettings: {},
    ...over,
  }
}

function mountPanel() {
  return mount(PlansPanel, {
    global: {
      stubs: { EmptyState: true, PaginatedListPanel: true, PlanSaveModal: true },
    },
  })
}

/** 手动可控的 Promise，用来制造「先发的后到」 */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.user = ref(null) as unknown as typeof h.user
  h.favorites = ref([]) as unknown as typeof h.favorites
  h.loading = ref(false) as unknown as typeof h.loading
  h.deleting = ref(false) as unknown as typeof h.deleting
  h.getPlans.mockResolvedValue([])
  h.deletePlan.mockResolvedValue(undefined)
  h.updatePlan.mockResolvedValue(undefined)
  h.removeFavorite.mockResolvedValue(undefined)
})

describe('加载与代次守卫', () => {
  it('未登录不发请求；登录后加载一次', async () => {
    mountPanel()
    await flushPromises()
    expect(h.getPlans).not.toHaveBeenCalled()

    h.user.value = { id: 'u1' }
    await flushPromises()
    expect(h.getPlans).toHaveBeenCalledTimes(1)
  })

  it('登出后在途响应不回填（上一账号的方案不落到新账号的面板）', async () => {
    const stale = deferred<unknown>()
    h.getPlans.mockReturnValueOnce(stale.promise)
    h.user.value = { id: 'u1' }
    const wrapper = mountPanel()
    await flushPromises()
    expect(h.getPlans).toHaveBeenCalledTimes(1)

    // 登出：作废代次并取消在途请求
    h.user.value = null
    await flushPromises()
    expect(h.cancel).toHaveBeenCalled()

    // 换个账号进来并先完成它自己的加载（空列表）
    h.getPlans.mockResolvedValueOnce([])
    h.user.value = { id: 'u2' }
    await flushPromises()
    expect(h.getPlans).toHaveBeenCalledTimes(2)

    // 上一账号的响应此刻才到：必须被代次判据丢弃
    stale.resolve([plan({ id: 'stale', name: '上一账号方案' })])
    await flushPromises()
    expect(wrapper.findAll('.plan-group')).toHaveLength(0)
  })

  it('后发请求先落地时，先发的结果被丢弃', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    h.getPlans.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    h.user.value = { id: 'u1' }
    const wrapper = mountPanel()
    await flushPromises()

    // 第二次加载：触发方式是切账号（先登出再登录）
    h.user.value = null
    await flushPromises()
    h.user.value = { id: 'u2' }
    await flushPromises()
    expect(h.getPlans).toHaveBeenCalledTimes(2)

    second.resolve([plan({ id: 'p2', name: '新账号方案' })])
    await flushPromises()
    first.resolve([plan({ id: 'p1', name: '旧账号方案' })])
    await flushPromises()

    const names = wrapper.findAll('.plan-name').map((n) => n.text())
    expect(names).toEqual(['新账号方案'])
  })

  it('登出期间落地的响应被作废：再登录首帧不会闪出上一账号的方案', async () => {
    const stale = deferred<unknown>()
    h.getPlans.mockReturnValueOnce(stale.promise)
    h.user.value = { id: 'u1' }
    const wrapper = mountPanel()
    await flushPromises()

    h.user.value = null
    await flushPromises()

    // 登出状态下响应才落地：必须被代次判据丢弃，而不是留在内存里
    stale.resolve([plan({ id: 'stale', name: '上一账号方案' })])
    await flushPromises()

    // 新账号登录，请求还在途——这一帧不得显示上一账号的方案
    const pending = deferred<unknown>()
    h.getPlans.mockReturnValueOnce(pending.promise)
    h.user.value = { id: 'u2' }
    await flushPromises()
    expect(wrapper.findAll('.plan-group')).toHaveLength(0)

    pending.resolve([])
    await flushPromises()
    expect(wrapper.findAll('.plan-group')).toHaveLength(0)
  })

  it('加载失败走全局 toast，列表保持为空', async () => {
    h.getPlans.mockRejectedValue(new Error('boom'))
    h.user.value = { id: 'u1' }
    const wrapper = mountPanel()
    await flushPromises()

    expect(h.showError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: '方案列表加载失败，请稍后重试' })
    )
    expect(wrapper.findAll('.plan-group')).toHaveLength(0)
  })
})

describe('方案操作', () => {
  it('展开/收起切换', async () => {
    h.user.value = { id: 'u1' }
    h.getPlans.mockResolvedValue([plan()])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('.plan-header').trigger('click')
    expect(wrapper.find('.plan-detail').exists()).toBe(true)

    await wrapper.find('.plan-header').trigger('click')
    expect(wrapper.find('.plan-detail').exists()).toBe(false)
  })

  it('删除先弹确认，确认后删除并重新拉取列表', async () => {
    h.user.value = { id: 'u1' }
    h.getPlans.mockResolvedValue([plan()])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('.plan-header').trigger('click')
    await wrapper.find('.delete-btn').trigger('click')

    expect(h.showModal).toHaveBeenCalledTimes(1)
    const modalArg = h.showModal.mock.calls[0]![0] as {
      message: string
      mode: string
      onConfirm: () => void
    }
    expect(modalArg.message).toContain('确定要删除方案"钦州港选址方案"吗？')
    expect(modalArg.mode).toBe('confirm')
    expect(h.deletePlan).not.toHaveBeenCalled()

    modalArg.onConfirm()
    await flushPromises()
    expect(h.deletePlan).toHaveBeenCalledWith('p1')
    expect(h.getPlans).toHaveBeenCalledTimes(2)
  })

  it('删除失败提示，不重新拉取', async () => {
    h.user.value = { id: 'u1' }
    h.getPlans.mockResolvedValue([plan()])
    h.deletePlan.mockRejectedValue(new Error('nope'))
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('.plan-header').trigger('click')
    await wrapper.find('.delete-btn').trigger('click')
    const modalArg = h.showModal.mock.calls[0]![0] as { onConfirm: () => void }
    modalArg.onConfirm()
    await flushPromises()

    expect(h.showError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: '删除失败，请稍后重试' })
    )
    expect(h.getPlans).toHaveBeenCalledTimes(1)
  })

  it('「删除中」时按钮禁用并换文案', async () => {
    h.user.value = { id: 'u1' }
    h.getPlans.mockResolvedValue([plan()])
    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.find('.plan-header').trigger('click')

    h.deleting.value = true
    await flushPromises()
    const btn = wrapper.find('.delete-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toBe('删除中...')
  })
})

describe('重命名与加载方案', () => {
  it('重命名成功后关闭弹窗并重新拉取', async () => {
    h.user.value = { id: 'u1' }
    h.getPlans.mockResolvedValue([plan()])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('.plan-header').trigger('click')
    await wrapper.find('.edit-btn').trigger('click')

    const modal = wrapper.findComponent({ name: 'PlanSaveModal' })
    expect(modal.props('visible')).toBe(true)
    expect(modal.props('initialName')).toBe('钦州港选址方案')

    modal.vm.$emit('save', '  改名后的方案  ')
    await flushPromises()

    expect(h.updatePlan).toHaveBeenCalledWith('p1', '改名后的方案', {})
    expect(h.getPlans).toHaveBeenCalledTimes(2)
  })

  it('重命名失败把错误留在弹窗内，不关闭', async () => {
    h.user.value = { id: 'u1' }
    h.getPlans.mockResolvedValue([plan()])
    h.updatePlan.mockRejectedValue(new Error('重名了'))
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('.plan-header').trigger('click')
    await wrapper.find('.edit-btn').trigger('click')
    const modal = wrapper.findComponent({ name: 'PlanSaveModal' })
    modal.vm.$emit('save', 'x')
    await flushPromises()

    expect(modal.props('visible')).toBe(true)
    expect(modal.props('errorMsg')).toContain('重名了')
  })

  it('加载浸没方案：合法字段进 store 并跳转', async () => {
    const feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [108, 21] } }
    const facility = { id: 'f1', name: '某设施', lng: 108, lat: 21 }
    h.user.value = { id: 'u1' }
    h.getPlans.mockResolvedValue([
      plan({
        id: 'p-flood',
        businessType: 'flood',
        waterLevel: 5,
        floodFeatures: [feature],
        affectedFacilities: [facility],
        totalLoss: 12.5,
        floodRiskLevel: 'high',
      }),
    ])
    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.find('.plan-header').trigger('click')
    await wrapper.find('.load-btn').trigger('click')
    await flushPromises()

    expect(h.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        waterLevel: 5,
        floodFeatures: [feature],
        affectedFacilities: [facility],
        totalLoss: 12.5,
        floodRiskLevel: 'high',
      })
    )
    expect(h.push).toHaveBeenCalledWith('/flood-analysis')
  })

  it('加载浸没方案：非法字段降级为空数组，不整单丢弃', async () => {
    h.user.value = { id: 'u1' }
    h.getPlans.mockResolvedValue([
      plan({
        id: 'p-flood',
        businessType: 'flood',
        floodFeatures: [{ bad: 1 }],
        affectedFacilities: 'x',
      }),
    ])
    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.find('.plan-header').trigger('click')
    await wrapper.find('.load-btn').trigger('click')
    await flushPromises()

    expect(h.saveState).toHaveBeenCalledWith(
      expect.objectContaining({ floodFeatures: [], affectedFacilities: [] })
    )
    expect(h.push).toHaveBeenCalledWith('/flood-analysis')
  })
})

describe('收藏分区', () => {
  it('按 xiaoqu / facility 分组，空组不渲染', async () => {
    h.user.value = { id: 'u1' }
    h.favorites.value = [
      { id: 'f1', itemType: 'xiaoqu', itemId: 'x1', name: '某小区' },
      { id: 'f2', itemType: 'facility', itemId: 'y1', name: '某设施' },
    ]
    const wrapper = mountPanel()
    await flushPromises()

    const titles = wrapper.findAll('.fav-group-title').map((n) => n.text())
    expect(titles).toEqual(['选址小区', '浸没设施'])
    expect(wrapper.findAll('.fav-item')).toHaveLength(2)
  })

  it('取消收藏调用全局单例并提示', async () => {
    h.user.value = { id: 'u1' }
    h.favorites.value = [{ id: 'f1', itemType: 'xiaoqu', itemId: 'x1', name: '某小区' }]
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('.fav-remove').trigger('click')
    await flushPromises()

    expect(h.removeFavorite).toHaveBeenCalledWith('xiaoqu', 'x1')
    expect(h.showToast).toHaveBeenCalledWith('已取消收藏：某小区', 'success')
  })
})
