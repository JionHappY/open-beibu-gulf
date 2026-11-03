// @vitest-environment jsdom
/**
 * loadBoundaryGeoJson 的缓存与重试判据。
 *
 * 这个函数此前只有 2.5% 覆盖，但它的分支全是「线上才会踩、踩了就静默」的类型：
 *   - 缓存新鲜 ⇒ 不发请求（发一次就多一次首屏阻塞）；
 *   - 缓存过期 / 结构损坏 ⇒ 必须清掉重拉（否则坏缓存会永久卡住边界图层）；
 *   - 拉到的数据要打 featureType 标记且**克隆后再改**（就地改会污染 loadStatic 的共享缓存）；
 *   - 超过 500KB 只留内存、不写 sessionStorage（写进去会把配额挤爆）；
 *   - 三次失败才报错，退避期间被 abort 要立刻退出（组件卸载后不该继续打接口）。
 *
 * 这里用假定时器推进 1s/2s 退避，避免真等 3 秒。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockLoadStatic = vi.hoisted(() => vi.fn())
const mockWarn = vi.hoisted(() => vi.fn())
const mockError = vi.hoisted(() => vi.fn())
const mockDebug = vi.hoisted(() => vi.fn())

vi.mock('@/core/config', () => ({
  MAP_CONFIG: { DATA_PATHS: { boundary: '/static/boundary.geojson' } },
}))

vi.mock('@/shared', () => ({
  loadStatic: mockLoadStatic,
  logger: { warn: mockWarn, error: mockError, debug: mockDebug, info: vi.fn() },
  LAYER_DEFAULTS: { stroke: '#111111', boundaryFill: '#222222' },
}))

// schema 只用来判「缓存是否可用」：真 schema 的形状校验与缓存/重试行为无关，
// 这里用 __bad 标记模拟结构损坏，避免夹具跟着 schema 漂移。
vi.mock('@/types/schemas', () => ({
  boundaryFeatureCollectionSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  boundaryCacheSchema: {
    safeParse: (v: unknown) =>
      v && typeof v === 'object' && '__bad' in (v as object)
        ? { success: false }
        : { success: true, data: v },
  },
}))

const { loadBoundaryGeoJson, BOUNDARY_STYLE } = await import('../useBoundaryLayer')
const { STORAGE_KEYS } = await import('@/shared/constants')

const CACHE_KEY = STORAGE_KEYS.boundaryCache

const GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [108.6, 21.7] },
      properties: { name: '钦州' },
    },
  ],
}

function cacheEntry(data: unknown, ageMs = 0): string {
  return JSON.stringify({ data, timestamp: Date.now() - ageMs })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mockLoadStatic.mockResolvedValue(structuredClone(GEOJSON))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('缓存', () => {
  it('新鲜缓存直接返回，不发请求', async () => {
    sessionStorage.setItem(CACHE_KEY, cacheEntry(GEOJSON))

    const out = await loadBoundaryGeoJson()

    expect(out).toEqual(GEOJSON)
    expect(mockLoadStatic).not.toHaveBeenCalled()
  })

  it('超过 24h 的缓存作废并重新拉取，拉完覆盖写回', async () => {
    sessionStorage.setItem(CACHE_KEY, cacheEntry(GEOJSON, 25 * 60 * 60 * 1000))

    const out = await loadBoundaryGeoJson()

    expect(mockLoadStatic).toHaveBeenCalledTimes(1)
    expect(out).not.toBeNull()
    const written = JSON.parse(sessionStorage.getItem(CACHE_KEY)!)
    expect(Date.now() - written.timestamp).toBeLessThan(5_000)
  })

  it('缓存结构损坏：清 key、记 warn、重新拉取', async () => {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ __bad: true, timestamp: Date.now() }))

    await loadBoundaryGeoJson()

    expect(mockWarn).toHaveBeenCalled()
    expect(mockLoadStatic).toHaveBeenCalledTimes(1)
  })
})

describe('拉取与打标', () => {
  it('返回克隆后的数据并打 boundary 标记，原对象不被就地修改', async () => {
    const original = structuredClone(GEOJSON)
    mockLoadStatic.mockResolvedValue(original)

    const out = await loadBoundaryGeoJson()

    expect(out!.features[0]!.properties).toMatchObject({ name: '钦州', featureType: 'boundary' })
    // 就地改会污染 loadStatic 的共享缓存（D9）
    expect(
      (original.features[0]!.properties as Record<string, unknown>).featureType
    ).toBeUndefined()
  })

  it('超过 500KB 只返回不落盘，并记一次 debug', async () => {
    const huge = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [108.6, 21.7] },
          properties: { pad: 'x'.repeat(600_000) } as Record<string, unknown>,
        },
      ],
    }
    mockLoadStatic.mockResolvedValue(huge)

    const out = await loadBoundaryGeoJson()

    expect(out).not.toBeNull()
    expect(sessionStorage.getItem(CACHE_KEY)).toBeNull()
    expect(mockDebug).toHaveBeenCalled()
  })

  it('正常大小落 sessionStorage（带 timestamp）', async () => {
    await loadBoundaryGeoJson()
    const written = JSON.parse(sessionStorage.getItem(CACHE_KEY)!)
    expect(written.data.features[0].properties.featureType).toBe('boundary')
    expect(typeof written.timestamp).toBe('number')
  })
})

describe('失败与取消', () => {
  it('三次都失败：按 1s/2s 退避、onError 报告、返回 null', async () => {
    vi.useFakeTimers()
    mockLoadStatic.mockRejectedValue(new Error('boom'))
    const onError = vi.fn()

    const p = loadBoundaryGeoJson(onError)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)
    const out = await p

    expect(out).toBeNull()
    expect(mockLoadStatic).toHaveBeenCalledTimes(3)
    expect(onError).toHaveBeenCalledWith('边界数据加载失败，图层可能缺失')
    // 生产侧也不能吞错（logger.error 无 DEV 门控）
    expect(mockError).toHaveBeenCalled()
  })

  it('signal 已 abort：一次都不请求，直接返回 null', async () => {
    const ac = new AbortController()
    ac.abort()

    const out = await loadBoundaryGeoJson(undefined, ac.signal)

    expect(out).toBeNull()
    expect(mockLoadStatic).not.toHaveBeenCalled()
  })

  it('退避等待期间 abort：不再续试，返回 null 且不报错', async () => {
    vi.useFakeTimers()
    mockLoadStatic.mockRejectedValue(new Error('boom'))
    const onError = vi.fn()
    const ac = new AbortController()

    const p = loadBoundaryGeoJson(onError, ac.signal)
    await vi.advanceTimersByTimeAsync(100)
    ac.abort()
    await vi.advanceTimersByTimeAsync(5000)
    const out = await p

    expect(out).toBeNull()
    expect(mockLoadStatic).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('边界图层样式', () => {
  it('描边与填充派生自 LAYER_DEFAULTS，featureType 固定 boundary', () => {
    expect(BOUNDARY_STYLE).toEqual({
      strokeColor: '#111111',
      strokeWidth: 2,
      fillColor: '#222222',
      featureType: 'boundary',
    })
  })
})
