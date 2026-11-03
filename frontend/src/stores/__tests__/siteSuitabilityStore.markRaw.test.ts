import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, watch } from 'vue'

import type { SiteSuitabilityResponseParsed } from '@/types/schemas'

import { useSiteSuitabilityStore } from '../siteSuitabilityStore'

/**
 * 判据：响应载荷是「只读大对象」，入库后必须不是深层响应式的。
 *
 * 动因（2026-11-02 实测）：8,548 个面的 GeoJSON 若被做成深层 reactive，
 * 任何遍历它的监听都要走代理 get/ownKeys——拖动权重滑块 9s 内 8.1s 耗在
 * Vue 的 traverse 上（17 个长任务、最大 557ms、23.6fps）。markRaw 后 0.23s / 66.8fps。
 * 这条用例盯的是「结构属性」（不是性能数字）：改深层字段不得触发依赖。
 */
/** 最小合法响应：字段按 siteSuitabilityResponseSchema 填齐，避免用 as 缝合 */
function payload(): SiteSuitabilityResponseParsed {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [108.6, 21.7] },
        properties: { id: 1, score: 0.9, land: 0.8 },
      },
    ],
    metadata: {
      count: 1,
      weights: { inundation: 0.2, terrain: 0.2, land: 0.2, access: 0.2, demand: 0.2 },
      weightsSource: 'default',
      kdeP99: 0.9,
      minLandFrac: 0.3,
      maxLandFrac: 0.99,
      maxPortDistanceKm: 50,
    },
  }
}

describe('siteSuitabilityStore 大对象载荷', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('入库后深层字段改动不触发依赖（markRaw 生效）', async () => {
    const store = useSiteSuitabilityStore()
    const data = payload()
    store.setData(data)

    const spy = vi.fn()
    watch(() => store.data?.features[0]?.properties.score, spy)
    store.data!.features[0].properties.score = 0.5
    await nextTick()

    expect(spy).not.toHaveBeenCalled()
  })

  it('引用原样透传，不克隆（同一份数据喂图层与列表）', () => {
    const store = useSiteSuitabilityStore()
    const data = payload()
    store.setData(data)
    expect(store.data).toBe(data)
  })

  it('置空仍可写（失败/卸载路径不被 markRaw 影响）', () => {
    const store = useSiteSuitabilityStore()
    store.setData(payload())
    store.setData(null)
    expect(store.data).toBeNull()
  })
})
