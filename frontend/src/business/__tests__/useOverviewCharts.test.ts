import { describe, expect, it, vi } from 'vitest'

const getOverview = vi.fn()
vi.mock('@/services', () => ({
  forecastAdapter: { getOverview: (...a: unknown[]) => getOverview(...a) },
}))

import { useOverviewCharts } from '../useOverviewCharts'

describe('useOverviewCharts 请求生命周期', () => {
  it('🔴 cancel 后剔除在途 signal，不再等 10s 超时', async () => {
    let signal: AbortSignal | undefined
    let resolve!: (value: unknown) => void
    getOverview.mockImplementationOnce((s: AbortSignal) => {
      signal = s
      return new Promise((r) => {
        resolve = r
      })
    })

    const { loadOverviewCharts, cancelOverviewCharts } = useOverviewCharts()
    const pending = loadOverviewCharts()
    expect(signal?.aborted).toBe(false)

    cancelOverviewCharts()
    expect(signal?.aborted).toBe(true)

    resolve({ charts: { labels: [], series: [], unit: '' } })
    await pending
  })
})
