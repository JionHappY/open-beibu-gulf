/**
 * 港口对比的全序列取数：接口一次就带回每港 historical+forecast 全量，
 * 「当前时点是哪一个」只该在本地挑。自动播放每 500ms 一帧，
 * 若每帧都重打两个指标接口，播放 6s 就是 20 次多余请求。
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useForecastStore } from '@/stores/forecastStore'

const { getIndicatorComparison } = vi.hoisted(() => ({ getIndicatorComparison: vi.fn() }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/services', () => ({
  forecastAdapter: { getIndicatorComparison },
}))

import { useForecastComparison } from '../useForecastComparison'

/** 2025-07..2026-06 共 12 个月；值 = 港口基准 + 月序*10 ⇒ 任意时点可手算 */
const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const ordinal = 2025 * 12 + 6 + i
  return `${Math.floor(ordinal / 12)}-${String((ordinal % 12) + 1).padStart(2, '0')}`
})
const PORT_IDS = ['qinzhou', 'beihai', 'fangchenggang'] as const
const BASE: Record<string, number> = { qinzhou: 100, beihai: -50, fangchenggang: 70 }

function fakePorts(indicator: string) {
  const extra = indicator === 'container' ? 5 : 0
  const ports = Object.fromEntries(
    PORT_IDS.map((pid) => [
      pid,
      {
        historical: MONTHS.map((time, i) => ({ time, value: BASE[pid] + i * 10 + extra })),
        forecast: [],
      },
    ])
  )
  return { ports, unit: indicator === 'container' ? '万TEU' : '万吨', dataSource: 'model' as const }
}

async function load(): Promise<void> {
  const store = useForecastStore()
  const { load: run } = useForecastComparison()
  await run(store.activeTransactionId, new AbortController().signal)
}

describe('预测港口对比：全序列一次取', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getIndicatorComparison.mockReset()
    getIndicatorComparison.mockImplementation((ind: string) => Promise.resolve(fakePorts(ind)))
  })

  it('切时点不再重打指标接口，柱值按新时点本地重算', async () => {
    const store = useForecastStore()

    store.setCurrentTime('2026-06')
    await load()
    expect(getIndicatorComparison).toHaveBeenCalledTimes(2)
    // 2026-06 是第 12 个月：QZ 100+110=210、BH -50+110=60、FCG 70+110=180；集装箱各 +5
    expect(store.chart.barSeries.map((s) => s.data)).toEqual([
      [210, 60, 180],
      [215, 65, 185],
    ])

    store.setCurrentTime('2026-01')
    await load()
    // 缓存命中：请求次数不该增加
    expect(getIndicatorComparison).toHaveBeenCalledTimes(2)
    // 2026-01 是第 7 个月：100+60=160 / -50+60=10 / 70+60=130
    expect(store.chart.barSeries.map((s) => s.data)).toEqual([
      [160, 10, 130],
      [165, 15, 135],
    ])
  })

  it('年模式按 12 个月合计，单位补 /年', async () => {
    const store = useForecastStore()

    store.setCurrentTime('2026')
    await load()

    // 2026 只有 6 个月落在序列里：货物 160+170+180+190+200+210 = 1110
    expect(store.chart.barSeries[0].data).toEqual([1110, 210, 930])
    expect(store.chart.barUnit).toBe('万吨/年')
  })
})
