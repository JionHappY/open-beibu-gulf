/**
 * 同比增速视图（第四张指标卡）在折线 composable 里的接线：
 * growthMode=true 时 lineSeries 必须换成 t 与 t-12 的百分比，且单位变成 %——
 * 否则面板高亮已切、图还是绝对值，用户看到的两张图口径打架。
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useForecastStore } from '@/stores/forecastStore'

const { getTimeSeries } = vi.hoisted(() => ({ getTimeSeries: vi.fn() }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/services', () => ({
  forecastAdapter: { getTimeSeries },
}))

import { useForecastTimeseries } from '../useForecastTimeseries'

/** 2024-07..2026-06 共 24 个月，值 = 100 + 月序*10 ⇒ 同比可手算 */
function series() {
  const data = []
  for (let i = 0; i < 24; i++) {
    const ordinal = 2024 * 12 + 6 + i // 2024-07 起
    const year = Math.floor(ordinal / 12)
    const month = (ordinal % 12) + 1
    data.push({
      time: `${year}-${String(month).padStart(2, '0')}`,
      value: 100 + i * 10,
      type: 'forecast' as const,
    })
  }
  return [{ portId: 'QZ', portName: '钦州港', data }]
}

async function load(): Promise<void> {
  getTimeSeries.mockResolvedValue({ series: series(), unit: '万吨', dataSource: 'model' })
  const store = useForecastStore()
  const { load: run } = useForecastTimeseries()
  await run(store.activeTransactionId, new AbortController().signal)
}

describe('useForecastTimeseries 同比增速视图', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('默认（growthMode=false）仍是绝对值，单位不变（阴性对照）', async () => {
    const store = useForecastStore()
    store.setCurrentTime('2026-06')
    await load()

    expect(store.chart.lineUnit).not.toBe('%')
    expect(store.chart.lineSeries[0].data[store.chart.lineSeries[0].data.length - 1]).toBe(330)
  })

  it('growthMode=true ⇒ 逐点换成同比百分比，单位变为 %', async () => {
    const store = useForecastStore()
    store.setCurrentTime('2026-06')
    store.setGrowthMode(true)
    await load()

    expect(store.chart.lineUnit).toBe('%')
    // 窗口 2025-07..2026-06：2025-07 的值 220，t-12（2024-07）为 100 ⇒ +120%
    expect(store.chart.lineXData[0]).toBe('2025-07')
    expect(store.chart.lineSeries[0].data[0]).toBe(120)
  })

  it('窗口内某点在 t-12 缺失时留 null（不画成 0%）', async () => {
    // 只给 12 个点（2025-07..2026-06）：每个点的 t-12 都不在序列里
    getTimeSeries.mockResolvedValue({
      series: [{ portId: 'QZ', portName: '钦州港', data: series()[0].data.slice(12) }],
      unit: '万吨',
      dataSource: 'model',
    })
    const store = useForecastStore()
    store.setCurrentTime('2026-06')
    store.setGrowthMode(true)
    const { load: run } = useForecastTimeseries()
    await run(store.activeTransactionId, new AbortController().signal)

    expect(store.chart.lineSeries[0].data.every((v) => v === null)).toBe(true)
  })
})
