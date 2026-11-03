// @vitest-environment node
/**
 * 陆地占比上下限入参（G3 空间约束）：
 *
 * 选址候选此前只过滤 `land_frac >= 0.5`，而 480m 格的 land_frac = 1 表示整格皆陆地——
 * 内陆城区、远离岸线的农田都能进候选（用户实测：候选点落在市区和内陆）。
 * 本用例钉住三件事：
 * ① 上限缺省 = 0.99（"格内至少有一丝水体"= 水陆交界带）；
 * ② 合法值原样透传；
 * ③ 越界或上限 < 下限必须抛错——不许静默产生空集。
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MAX_LAND_FRAC,
  parseSuitabilityQuery,
} from '../src/modules/site-suitability/dto/site-suitability.dto'

describe('parseSuitabilityQuery · max_land_frac', () => {
  it('缺省 = 0.99，与默认下限 0.5 组成交界带', () => {
    const q = parseSuitabilityQuery({})
    expect(DEFAULT_MAX_LAND_FRAC).toBe(0.99)
    expect(q.maxLandFrac).toBe(0.99)
    expect(q.minLandFrac).toBe(0.5)
  })

  it('空串按缺省处理', () => {
    expect(parseSuitabilityQuery({ max_land_frac: '' }).maxLandFrac).toBe(0.99)
  })

  it('合法值原样透传（放宽到 1 = 不设上限，可复现旧行为）', () => {
    expect(parseSuitabilityQuery({ max_land_frac: '1' }).maxLandFrac).toBe(1)
    expect(parseSuitabilityQuery({ max_land_frac: 0.75 }).maxLandFrac).toBe(0.75)
  })

  it('越界/非数值抛错', () => {
    expect(() => parseSuitabilityQuery({ max_land_frac: '-0.1' })).toThrow(/max_land_frac/)
    expect(() => parseSuitabilityQuery({ max_land_frac: '1.5' })).toThrow(/max_land_frac/)
    expect(() => parseSuitabilityQuery({ max_land_frac: 'abc' })).toThrow(/max_land_frac/)
  })

  it('上限 < 下限直接拒收（否则筛选结果恒为空却返回 200）', () => {
    expect(() => parseSuitabilityQuery({ min_land_frac: '0.9', max_land_frac: '0.6' })).toThrow(
      /max_land_frac 须 ≥ min_land_frac/
    )
  })
})
