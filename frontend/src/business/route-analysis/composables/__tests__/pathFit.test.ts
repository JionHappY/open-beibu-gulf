import { describe, expect, it } from 'vitest'

import { fitViewForPath } from '../pathFit'

describe('fitViewForPath', () => {
  it('111km 路线：中心取 bbox 中点，高度足以覆盖整条路径', () => {
    const view = fitViewForPath(
      [
        [108.0, 21.5],
        [108.535, 21.5],
        [109.07, 21.5],
      ],
      111_000
    )

    expect(view).not.toBeNull()
    expect(view?.center.lng).toBeCloseTo(108.535, 3)
    expect(view?.center.lat).toBeCloseTo(21.5, 3)
    // 旧行为停在默认 5km 高度，只看得见终点；111km 路线必须给出 >100km 高度
    expect(view?.height).toBeGreaterThan(100_000)
  })

  it('弯曲路线：高度按里程而非 bbox 对角线，宁可略宽不裁末端', () => {
    // bbox 只有 0.1° 见方，但实际里程 80km（绕路）
    const view = fitViewForPath(
      [
        [108.5, 21.5],
        [108.6, 21.6],
      ],
      80_000
    )

    expect(view?.height).toBeGreaterThan(80_000)
  })

  it('单点/长度缺失：高度夹到下限，不贴地', () => {
    expect(fitViewForPath([[108.5, 21.5]], 0)?.height).toBe(2000)
    expect(fitViewForPath([[108.5, 21.5]], Number.NaN)?.height).toBe(2000)
  })

  it('空数组或非有限坐标：返回 null（调用方不移动相机）', () => {
    expect(fitViewForPath([], 1000)).toBeNull()
    expect(fitViewForPath([[Number.NaN, 21.5]], 1000)).toBeNull()
    expect(fitViewForPath([[Infinity, 21.5]], 1000)).toBeNull()
  })
})
