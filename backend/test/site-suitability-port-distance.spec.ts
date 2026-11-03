// @vitest-environment node
/**
 * 距最近既有港口上限（G3「距离太远的不该选出来」）：
 *
 * 为什么是硬约束：land_frac 过滤后仍有 3,572 格，到港口中位 60.8km、最远 150.3km。
 * access 权重只有 1/5，内陆格在土地/地形上拿满分仍能进前列 ⇒ 单靠权重压不住。
 *
 * 本用例钉住四件事：
 * ① 缺省 = 50km（作者设定，非数据推导）；
 * ② 空串按缺省处理；
 * ③ 0 = 不设上限（显式复现旧行为，便于口径对照）；
 * ④ 越界（负值 / >500 / 非数值）必须抛错 —— 不许静默变成"筛掉全部"。
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MAX_PORT_DISTANCE_KM,
  parseSuitabilityQuery,
} from '../src/modules/site-suitability/dto/site-suitability.dto'

describe('parseSuitabilityQuery · max_port_distance_km', () => {
  it('缺省 = 50km', () => {
    expect(DEFAULT_MAX_PORT_DISTANCE_KM).toBe(50)
    expect(parseSuitabilityQuery({}).maxPortDistanceKm).toBe(50)
  })

  it('空串按缺省处理', () => {
    expect(parseSuitabilityQuery({ max_port_distance_km: '' }).maxPortDistanceKm).toBe(50)
  })

  it('0 表示不设上限；合法值原样透传', () => {
    expect(parseSuitabilityQuery({ max_port_distance_km: '0' }).maxPortDistanceKm).toBe(0)
    expect(parseSuitabilityQuery({ max_port_distance_km: 30 }).maxPortDistanceKm).toBe(30)
  })

  it('负值 / 超上限 / 非数值抛错（防单位写错把结果筛空）', () => {
    expect(() => parseSuitabilityQuery({ max_port_distance_km: '-1' })).toThrow(
      /max_port_distance_km/
    )
    expect(() => parseSuitabilityQuery({ max_port_distance_km: '501' })).toThrow(
      /max_port_distance_km/
    )
    expect(() => parseSuitabilityQuery({ max_port_distance_km: 'abc' })).toThrow(
      /max_port_distance_km/
    )
  })
})
