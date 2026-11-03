// @vitest-environment jsdom
/**
 * usePlans 测试：方案读/改/删的登录守卫、写入校验与请求形状。
 *
 * 这个 composable 此前 0% 覆盖，却承载两处「静默坏掉也看不出来」的契约：
 *   ① 未登录时 delete/update 必须直接抛「请先登录」，而不是发一个注定 401 的请求；
 *   ② typeSettings 是 JSONB，schema 只做 unknown 透传 ⇒ 写入前必须自证结构，
 *      否则脏数据会被存进库，读侧再按 TypeSetting 用就炸在别处。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'vue'

const mockApiRequest = vi.hoisted(() => vi.fn())
const mockPush = vi.hoisted(() => vi.fn())
const mockLoggerError = vi.hoisted(() => vi.fn())
const authState = vi.hoisted(() => ({ isAuthenticated: null as Ref<boolean> | null }))

vi.mock('@/shared/composables/useApiRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/composables/useApiRequest')>()
  return { ...actual, useApiRequest: () => ({ apiRequest: mockApiRequest }) }
})

vi.mock('@/shared/composables/useAuth', async () => {
  const { ref } = await import('vue')
  const isAuthenticated = ref(false)
  authState.isAuthenticated = isAuthenticated
  return { useAuth: () => ({ isAuthenticated }) }
})

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockPush }) }))

vi.mock('@/shared/utils/errorHandler', () => ({
  isAuthError: (e: unknown) => (e as { name?: string })?.name === 'AuthError',
  handleAuthError: vi.fn(async () => undefined),
}))

vi.mock('@/shared/utils/logger', () => ({ logger: { error: mockLoggerError } }))

const { usePlans } = await import('../usePlans')

/** 最小合法 Plan（apiRequest 被 mock，schema 不参与校验，只需形状可读） */
const PLAN = {
  id: 'p1',
  name: '方案一',
  ownerId: 'u1',
  selectedKeys: ['a'],
  typeSettings: {},
  createdAt: 1,
  updatedAt: 2,
}

const SETTINGS = {
  a: { selected: true, importance: 3, defaultRadius: 500 },
  b: { selected: false, importance: 1, defaultRadius: 300 },
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.isAuthenticated!.value = false
})

describe('usePlans 读取', () => {
  it('getPlans 返回数组，loading 结束后复位且请求带 schema 与 signal', async () => {
    mockApiRequest.mockResolvedValue([PLAN])
    const { getPlans, loading } = usePlans()

    const p = getPlans()
    expect(loading.value).toBe(true)
    await expect(p).resolves.toEqual([PLAN])
    expect(loading.value).toBe(false)

    const [url, opts] = mockApiRequest.mock.calls[0]!
    expect(url).toBe('/plans')
    expect(opts.schema).toBeTruthy()
    expect(opts.signal).toBeInstanceOf(AbortSignal)
  })

  it('getPlans 失败：错误原样抛出、记日志、loading 复位', async () => {
    const boom = new Error('db down')
    mockApiRequest.mockRejectedValue(boom)
    const { getPlans, loading } = usePlans()

    await expect(getPlans()).rejects.toBe(boom)
    expect(mockLoggerError).toHaveBeenCalled()
    expect(loading.value).toBe(false)
  })

  it('cancel 把 loading 拉回 false', async () => {
    mockApiRequest.mockReturnValue(new Promise(() => {}))
    const { getPlans, loading, cancel } = usePlans()
    void getPlans()
    expect(loading.value).toBe(true)
    cancel()
    expect(loading.value).toBe(false)
  })
})

describe('usePlans 写入的登录守卫', () => {
  it('未登录 deletePlan 直接抛「请先登录」且不发请求', async () => {
    const { deletePlan } = usePlans()
    await expect(deletePlan('p1')).rejects.toThrow('请先登录')
    expect(mockApiRequest).not.toHaveBeenCalled()
  })

  it('未登录 updatePlan 直接抛「请先登录」且不发请求', async () => {
    const { updatePlan } = usePlans()
    await expect(updatePlan('p1', 'n', SETTINGS)).rejects.toThrow('请先登录')
    expect(mockApiRequest).not.toHaveBeenCalled()
  })

  it('已登录 deletePlan 走 DELETE，deleting 复位', async () => {
    authState.isAuthenticated!.value = true
    mockApiRequest.mockResolvedValue(undefined)
    const { deletePlan, deleting } = usePlans()

    await deletePlan('p1')
    expect(mockApiRequest).toHaveBeenCalledWith('/plans/p1', { method: 'DELETE' })
    expect(deleting.value).toBe(false)
  })
})

describe('usePlans 写入校验', () => {
  beforeEach(() => {
    authState.isAuthenticated!.value = true
  })

  it('typeSettings 非对象直接拒写', async () => {
    const { updatePlan } = usePlans()
    await expect(updatePlan('p1', 'n', ['x'])).rejects.toThrow('方案类型设置格式无效')
    expect(mockApiRequest).not.toHaveBeenCalled()
  })

  it('typeSettings 某一项的 selected 不是布尔（脏结构）按 key 指名拒写', async () => {
    const { updatePlan } = usePlans()
    await expect(
      updatePlan('p1', 'n', { a: { selected: 'yes', importance: 1, defaultRadius: 5 } })
    ).rejects.toThrow('方案类型设置 a 格式无效')
    expect(mockApiRequest).not.toHaveBeenCalled()
  })

  it('updatePlan 只把 selected=true 的键写进 selectedKeys，typeSettings 原样透传', async () => {
    mockApiRequest.mockResolvedValue(PLAN)
    const { updatePlan } = usePlans()

    await expect(updatePlan('p1', '改名', SETTINGS)).resolves.toEqual(PLAN)
    const [url, opts] = mockApiRequest.mock.calls[0]!
    expect(url).toBe('/plans/p1')
    expect(opts.method).toBe('PUT')
    const body = JSON.parse(opts.body)
    expect(body.name).toBe('改名')
    expect(body.selectedKeys).toEqual(['a'])
    expect(body.typeSettings).toEqual(SETTINGS)
  })

  it('null 的 typeSettings 视为空对象（新建方案未配置类型时）', async () => {
    mockApiRequest.mockResolvedValue(PLAN)
    const { updatePlan } = usePlans()
    await updatePlan('p1', 'n', null)
    const body = JSON.parse(mockApiRequest.mock.calls[0]![1].body)
    expect(body.selectedKeys).toEqual([])
    expect(body.typeSettings).toEqual({})
  })
})
