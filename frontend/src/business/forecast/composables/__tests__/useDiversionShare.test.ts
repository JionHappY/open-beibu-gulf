/**
 * 分流份额并入预测页：按年取、按年缓存。
 *
 * 承重约束只有两条，都由自动播放的实际节奏逼出来：
 * - 同一年内换月不许重发（一年 12 帧，重发就是 12 倍流量）；
 * - 回拖到取过的年份不许重发（缓存按年）。
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useForecastStore } from '@/stores/forecastStore'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))

vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared')>()
  return { ...actual, useApiRequest: () => ({ apiRequest }) }
})

import { useDiversionShare } from '../useDiversionShare'

/** 后端 /diversion/breakdown 形状的最小响应（只保留本组合式消费的字段） */
function breakdown(year: number) {
  return {
    year,
    transfer: { year, coal: 400, grain: 800, ironOre: 300, sandCement: 0 },
    // 故意按「小 → 大」插入：排序若不是真在算，用例必须红
    byPort: {
      beihai: { coal: 40, grain: 70, ironOre: 40, total: 150 },
      qinzhou: { coal: 200, grain: 400, ironOre: 150, total: 750 },
      fangchenggang: { coal: 160, grain: 330, ironOre: 110, total: 600 },
    },
    sankeyFlows: [],
  }
}

describe('useDiversionShare', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiRequest.mockReset()
    apiRequest.mockImplementation((_url: string, opts: { params: { year: number } }) =>
      Promise.resolve(breakdown(opts.params.year))
    )
  })

  it('首帧按当前年份取一次，端口按总量降序且占比合计为 1', async () => {
    const store = useForecastStore()
    store.currentTime = '2035-06'
    const { ports, total, year } = useDiversionShare()
    await vi.waitFor(() => expect(ports.value).toHaveLength(3))

    expect(year.value).toBe(2035)
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(ports.value.map((p) => p.id)).toEqual(['qinzhou', 'fangchenggang', 'beihai'])
    expect(ports.value.map((p) => p.name)).toEqual(['钦州', '防城港', '北海'])
    expect(total.value).toBeCloseTo(1500)
    expect(ports.value.reduce((acc, p) => acc + p.share, 0)).toBeCloseTo(1)
    expect(ports.value[0]!.share).toBeCloseTo(0.5)
  })

  it('同一年内换月不重发', async () => {
    const store = useForecastStore()
    store.currentTime = '2035-06'
    const { ports } = useDiversionShare()
    await vi.waitFor(() => expect(ports.value).toHaveLength(3))

    store.currentTime = '2035-11'
    await Promise.resolve()
    expect(apiRequest).toHaveBeenCalledTimes(1)
  })

  it('跨年重发，回拖到取过的年份走缓存', async () => {
    const store = useForecastStore()
    store.currentTime = '2035-06'
    const { ports } = useDiversionShare()
    await vi.waitFor(() => expect(ports.value).toHaveLength(3))

    store.currentTime = '2036-01'
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2))

    store.currentTime = '2035-01'
    await vi.waitFor(() => expect(ports.value).toHaveLength(3))
    expect(apiRequest).toHaveBeenCalledTimes(2)
  })
})
