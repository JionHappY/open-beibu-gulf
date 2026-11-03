// @vitest-environment jsdom
/**
 * PaginatedListPanel 的分页与收藏判据。
 *
 * 这个组件被选址候选名单、浸没设施清单、个人中心方案共用，此前行覆盖只有 9.6%：
 * 分页切页、越界跳转、数据变短后回第一页、未登录收藏引导、坐标无效拒收、
 * 收藏类型随面板业务类型（flood→facility、其余→xiaoqu）都没有判据。
 * 其中最容易坏的是「坐标无效」——它决定会不会把 (0,0) 哨兵写进收藏。
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const state = vi.hoisted(() => ({
  isAuthenticated: null as unknown as { value: boolean },
  favSet: new Set<string>(),
}))

const mockFavorites = vi.hoisted(() => ({
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  promptLoginForFavorite: vi.fn(),
}))

const mockShowError = vi.hoisted(() => vi.fn())
const mockShowToast = vi.hoisted(() => vi.fn())

vi.mock('../../composables/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: state.isAuthenticated }),
}))

vi.mock('../../composables/useFavorites', () => ({
  useFavorites: () => ({
    isFavorite: (type: string, id: string) => state.favSet.has(`${type}:${id}`),
    addFavorite: mockFavorites.addFavorite,
    removeFavorite: mockFavorites.removeFavorite,
    promptLoginForFavorite: mockFavorites.promptLoginForFavorite,
  }),
}))

vi.mock('../../layout/useGCS', () => ({
  useGCS: () => ({
    css: {
      cell8px: '8px',
      cell16px: '16px',
      cell40px: '40px',
      fontSizeTitle: '14px',
      fontSizeBody: '12px',
      fontSizeSmall: '10px',
    },
  }),
}))

vi.mock('../../utils/errorHandler', () => ({ showError: mockShowError }))
vi.mock('../../utils/gcsFeedback', () => ({ showToast: mockShowToast }))
vi.mock('../../utils/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }))

const { default: PaginatedListPanel } = await import('../PaginatedListPanel.vue')

const ElButton = {
  props: ['type', 'size', 'text', 'disabled'],
  emits: ['click'],
  template: '<button @click="$emit(\'click\', $event)"><slot /></button>',
}

function items(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `x${i + 1}`,
    name: `小区${i + 1}`,
    lng: 108.6 + i * 0.01,
    lat: 21.7,
    score: 0.9,
    breakdown: { a: 1 },
    type: 'facility',
    loss: 0.1,
  }))
}

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(PaginatedListPanel, {
    props: { items: items(10), pageSize: 4, ...props },
    global: {
      components: { ElButton },
      stubs: { EmptyState: { template: '<div class="empty-stub"><slot /></div>' } },
    },
    slots: { item: '<span class="cell-name">{{ params.item.name }}</span>' },
  })
}

function visibleNames(wrapper: ReturnType<typeof mountPanel>): string[] {
  return wrapper.findAll('.cell-name').map((n) => n.text())
}

function buttonByText(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)!
}

beforeEach(() => {
  vi.clearAllMocks()
  state.isAuthenticated = ref(false) as unknown as { value: boolean }
  state.favSet.clear()
  mockFavorites.addFavorite.mockResolvedValue({ existed: false })
  mockFavorites.removeFavorite.mockResolvedValue(undefined)
})

describe('分页', () => {
  it('10 条 / 每页 4：首屏 4 条，翻页与首末页跳转正确', async () => {
    const wrapper = mountPanel()
    expect(visibleNames(wrapper)).toEqual(['小区1', '小区2', '小区3', '小区4'])

    await buttonByText(wrapper, '>').trigger('click')
    expect(visibleNames(wrapper)).toEqual(['小区5', '小区6', '小区7', '小区8'])

    await buttonByText(wrapper, '>>').trigger('click')
    expect(visibleNames(wrapper)).toEqual(['小区9', '小区10'])

    await buttonByText(wrapper, '<<').trigger('click')
    expect(visibleNames(wrapper)).toEqual(['小区1', '小区2', '小区3', '小区4'])
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('pageSize <= 0：不分页、全部渲染', () => {
    const wrapper = mountPanel({ pageSize: 0 })
    expect(visibleNames(wrapper)).toHaveLength(10)
    expect(wrapper.findAll('button').filter((b) => ['>', '<'].includes(b.text()))).toHaveLength(0)
  })

  it('数据变短后回到第一页（不在空页上停住）', async () => {
    const wrapper = mountPanel()
    await buttonByText(wrapper, '>>').trigger('click')
    expect(visibleNames(wrapper)).toEqual(['小区9', '小区10'])

    await wrapper.setProps({ items: items(2) })
    expect(visibleNames(wrapper)).toEqual(['小区1', '小区2'])
  })

  it('空列表走空态，不渲染分页', () => {
    const wrapper = mountPanel({ items: [] })
    expect(visibleNames(wrapper)).toHaveLength(0)
    expect(wrapper.find('.empty-stub').exists()).toBe(true)
  })
})

describe('收藏', () => {
  it('未登录：记录收藏意图并引导登录，不发请求', async () => {
    const wrapper = mountPanel()
    await wrapper.findAll('.favorite-btn')[0]!.trigger('click')

    expect(mockFavorites.promptLoginForFavorite).toHaveBeenCalledTimes(1)
    expect(mockFavorites.addFavorite).not.toHaveBeenCalled()
    const input = mockFavorites.promptLoginForFavorite.mock.calls[0]![0]
    expect(input).toMatchObject({ itemType: 'facility', itemId: 'x1', name: '小区1' })
    expect(input.snapshot).toEqual({ score: 0.9, breakdown: { a: 1 }, type: 'facility', loss: 0.1 })
  })

  it('已登录未收藏：addFavorite 带业务快照，提示「已收藏」', async () => {
    state.isAuthenticated = ref(true) as unknown as { value: boolean }
    const wrapper = mountPanel({ planType: 'flood' })
    await wrapper.findAll('.favorite-btn')[0]!.trigger('click')

    expect(mockFavorites.addFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: 'facility', itemId: 'x1' })
    )
    expect(mockShowToast).toHaveBeenCalledWith('已收藏：小区1', 'success')
  })

  it('planType 非 flood 时收藏类型是 xiaoqu', async () => {
    state.isAuthenticated = ref(true) as unknown as { value: boolean }
    const wrapper = mountPanel({ planType: 'site' })
    await wrapper.findAll('.favorite-btn')[0]!.trigger('click')
    expect(mockFavorites.addFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: 'xiaoqu' })
    )
  })

  it('已收藏：再点走 removeFavorite 并提示取消', async () => {
    state.isAuthenticated = ref(true) as unknown as { value: boolean }
    state.favSet.add('facility:x1')
    const wrapper = mountPanel()
    await wrapper.findAll('.favorite-btn')[0]!.trigger('click')

    expect(mockFavorites.removeFavorite).toHaveBeenCalledWith('facility', 'x1')
    expect(mockShowToast).toHaveBeenCalledWith('已取消收藏：小区1', 'success')
  })

  it('坐标无效：拒绝收藏并报错（不把 (0,0) 写进收藏）', async () => {
    state.isAuthenticated = ref(true) as unknown as { value: boolean }
    const bad = [{ ...items(1)[0]!, lng: Number.NaN }]
    const wrapper = mountPanel({ items: bad })
    await wrapper.findAll('.favorite-btn')[0]!.trigger('click')

    // 判据挂在「坐标前置校验」这一层：无守卫时 toFavoriteInput 会在 try 内抛，
    // 仍会走到 catch 的通用文案，只有 fallback 能区分是哪条路径。
    expect(mockShowError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: '坐标无效，无法收藏' })
    )
    expect(mockFavorites.addFavorite).not.toHaveBeenCalled()
    expect(mockFavorites.promptLoginForFavorite).not.toHaveBeenCalled()
  })

  it('showFavorite=false 时不渲染收藏键', () => {
    const wrapper = mountPanel({ showFavorite: false })
    expect(wrapper.findAll('.favorite-btn')).toHaveLength(0)
  })
})

describe('点击列表项', () => {
  it('把副本交给注入的 flyTo（不改原对象身份）', async () => {
    const flyTo = vi.fn()
    const data = items(3)
    const wrapper = mountPanel({ items: data, flyTo })
    await wrapper.findAll('.list-item')[0]!.trigger('click')

    expect(flyTo).toHaveBeenCalledTimes(1)
    expect(flyTo.mock.calls[0]![0]).toEqual(data[0])
    expect(flyTo.mock.calls[0]![0]).not.toBe(data[0])
  })
})
