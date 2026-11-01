// @vitest-environment jsdom
/**
 * 失败 / 成功空 / 真实零 的报告呈现。
 *
 * 钉住三条用户可见契约：
 *  1. 请求失败且已有旧统计 ⇒ 旧值原样保留，标题出现「上次结果（水位 Xm）」标记；
 *  2. 没有统计载荷 ⇒ 一行 0 值都不渲染（不能把「没拿到」显示成「真的没有」）；
 *  3. 成功响应里的真实零（水位 0m）⇒ 照常显示 0，不误标 stale / 空态。
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared')>()
  return {
    ...actual,
    useGCS: () => ({ cellPixel: { value: 48 }, css: { cell16px: '16px' } }),
  }
})

import { useFloodStore } from '@/stores'
import type { FloodStatistics } from '@/types'

import FloodAnalysisReportPanel from '../FloodAnalysisReportPanel.vue'

const oldStats: FloodStatistics = {
  riskLevel: '中风险',
  waterLevel: 5,
  actualWaterLevel: 5,
  requestedWaterLevel: 5,
  floodArea: 12.5,
  averageDepth: 1.2,
  maxDepth: 2.4,
  affectedFacilityCount: 2,
  estimatedLoss: 50000,
}

const facility = (id: string) => ({
  id,
  name: `设施${id}`,
  type: '港口码头',
  lng: 108.5,
  lat: 21.7,
  loss: 25000,
  damageRate: 0.1,
})

describe('FloodAnalysisReportPanel — 失败/空/真实零', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('失败 + 旧统计：旧值保留，标题标「上次结果（水位 5m）」并带当前水位失败说明', () => {
    const store = useFloodStore()
    store.startFloodAnalysis(oldStats, [], '中风险')
    store.setPortImpactResult([facility('a'), facility('b')], 50000)
    store.setWaterLevel(7)
    store.setAnalysisStatus('failure')

    const wrapper = mount(FloodAnalysisReportPanel)
    const text = wrapper.text()
    expect(text).toContain('12.5 km²')
    expect(text).toContain('1.2 m')
    expect(text).toContain('2 个')

    const badge = wrapper.find('.stale-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('上次结果（水位 5m）')
    expect(badge.attributes('title')).toContain('水位 7m 请求失败')
    expect(badge.attributes('title')).toContain('仍显示上次结果（水位 5m）')
    wrapper.unmount()
  })

  it('失败 + 无旧统计：只显示失败占位，不出现 0 个 / 0元 / 无风险', () => {
    const store = useFloodStore()
    store.setWaterLevel(7)
    store.setAnalysisStatus('failure')

    const wrapper = mount(FloodAnalysisReportPanel)
    expect(wrapper.findAll('.info-item')).toHaveLength(0)
    expect(wrapper.find('.report-placeholder').text()).toBe('淹没分析请求失败，暂无数据')
    const text = wrapper.text()
    expect(text).not.toContain('0 个')
    expect(text).not.toContain('0元')
    expect(text).not.toContain('无风险')
    wrapper.unmount()
  })

  it('成功空 + 无旧统计：显示「暂无淹没分析结果」，不渲染 0 值行', () => {
    const store = useFloodStore()
    store.setWaterLevel(3)
    store.setAnalysisStatus('empty')

    const wrapper = mount(FloodAnalysisReportPanel)
    expect(wrapper.find('.report-placeholder').text()).toBe('暂无淹没分析结果')
    expect(wrapper.findAll('.info-item')).toHaveLength(0)
    expect(wrapper.find('.stale-badge').exists()).toBe(false)
    wrapper.unmount()
  })

  it('成功空 + 旧统计：旧值保留并标 stale（用户口径：空响应同样不丢旧结果）', () => {
    const store = useFloodStore()
    store.startFloodAnalysis(oldStats, [], '中风险')
    store.setWaterLevel(3)
    store.setAnalysisStatus('empty')

    const wrapper = mount(FloodAnalysisReportPanel)
    expect(wrapper.text()).toContain('12.5 km²')
    const badge = wrapper.find('.stale-badge')
    expect(badge.text()).toBe('上次结果（水位 5m）')
    expect(badge.attributes('title')).toContain('未返回淹没统计')
    wrapper.unmount()
  })

  it('真实零：waterLevel 0 的完整统计照常显示 0，不标 stale / 空态', () => {
    const store = useFloodStore()
    store.startFloodAnalysis(
      {
        riskLevel: '无风险',
        waterLevel: 0,
        actualWaterLevel: 0,
        floodArea: 0,
        averageDepth: 0,
        maxDepth: 0,
        estimatedLoss: 0,
      },
      [],
      '无风险'
    )
    store.setWaterLevel(0)

    const wrapper = mount(FloodAnalysisReportPanel)
    const text = wrapper.text()
    expect(text).toContain('0 km²')
    expect(text).toContain('0 m')
    expect(text).toContain('0 个')
    expect(text).toContain('无风险')
    expect(wrapper.find('.stale-badge').exists()).toBe(false)
    expect(wrapper.find('.report-placeholder').exists()).toBe(false)
    wrapper.unmount()
  })

  it('请求中 + 无旧统计：显示分析中占位，不渲染 0 值行', () => {
    const store = useFloodStore()
    store.setWaterLevel(4)
    store.setAnalysisStatus('requesting')

    const wrapper = mount(FloodAnalysisReportPanel)
    expect(wrapper.find('.report-placeholder').text()).toBe('淹没分析中…')
    expect(wrapper.findAll('.info-item')).toHaveLength(0)
    wrapper.unmount()
  })
})
