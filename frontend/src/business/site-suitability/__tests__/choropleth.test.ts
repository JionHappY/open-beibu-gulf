import { describe, expect, it } from 'vitest'

import { binAlpha, choroplethFeatures, type ScoredPoint } from '../choropleth'

function pts(scores: number[]): ScoredPoint[] {
  return scores.map((score, i) => ({ lng: 108 + i * 0.03, lat: 21.6, score }))
}

describe('choropleth 分档与几何', () => {
  it('按秩切五档：10 个格 ⇒ 每档 2 个，升序对齐', () => {
    const fc = choroplethFeatures(
      pts([0.52, 0.58, 0.61, 0.64, 0.7, 0.73, 0.78, 0.82, 0.9, 0.96]),
      0.02
    )
    expect(fc.features.map((f) => f.properties.bin)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })

  it('并列分数也均分五档，且两次构建的档位一致（截图可比）', () => {
    const ties = Array.from({ length: 20 }, (_, i) => ({
      lng: 108 + (i % 5) * 0.03,
      lat: 21.6 + Math.floor(i / 5) * 0.03,
      score: 0.6,
    }))
    const a = choroplethFeatures(ties, 0.02).features.map((f) => f.properties.bin)
    const b = choroplethFeatures(ties, 0.02).features.map((f) => f.properties.bin)
    expect(a).toEqual(b)
    expect(a.filter((x) => x === 0)).toHaveLength(4)
    expect(a.filter((x) => x === 4)).toHaveLength(4)
  })

  it('方块边长等于聚合分辨率、环闭合，分数原样带出', () => {
    const [f] = choroplethFeatures([{ lng: 108.6, lat: 21.7, score: 0.81 }], 0.02).features
    const ring = f.geometry.coordinates[0]
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
    const xs = ring.map(([x]) => x)
    const ys = ring.map(([, y]) => y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.02, 6)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.02, 6)
    // 单个格没有"相对高低"可言，按秩落在最低档（颜色最浅），不臆造中间档
    expect(f.properties).toEqual({ score: 0.81, bin: 0 })
  })

  it('坐标非有限的格被丢弃（不让一条脏点塌掉整层）', () => {
    const withBad = [
      { lng: 108.6, lat: 21.7, score: 0.9 },
      { lng: Number.NaN, lat: 21.7, score: 0.9 },
    ]
    expect(choroplethFeatures(withBad, 0.02).features).toHaveLength(1)
  })

  it('空输入返回空要素集，不抛异常', () => {
    expect(choroplethFeatures([], 0.02).features).toHaveLength(0)
  })

  it('透明度随档位单调递增，越界下标夹到两端', () => {
    expect(binAlpha(-3)).toBe(0.06)
    expect(binAlpha(4)).toBe(0.92)
    expect(binAlpha(99)).toBe(0.92)
    for (let i = 1; i < 5; i++) expect(binAlpha(i)).toBeGreaterThan(binAlpha(i - 1))
  })
})
