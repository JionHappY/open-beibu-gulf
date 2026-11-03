import { describe, expect, it } from 'vitest'

import { shiftBack12, toLookup, yoyAt, yoyOf } from '../yoy'

describe('yoy：同比增速口径', () => {
  it('月粒度退 12 个月，跨年正确（2027-03 → 2026-03）', () => {
    expect(shiftBack12('2027-03', 'month')).toBe('2026-03')
  })

  it('月粒度退 12 个月，一月回退到上一年同月（2026-01 → 2025-01）', () => {
    expect(shiftBack12('2026-01', 'month')).toBe('2025-01')
  })

  it('年粒度退 1 年，键仍是 4 位年（不是 5 位）', () => {
    expect(shiftBack12('2027', 'year')).toBe('2026')
  })

  it('同比保留 1 位小数（100 → 103.33 记 3.3）', () => {
    expect(yoyOf(103.33, 100)).toBe(3.3)
  })

  it('负增长给负数（90 vs 100 ⇒ -10）', () => {
    expect(yoyOf(90, 100)).toBe(-10)
  })

  it('前期为 0 ⇒ null（不是 +∞，也不折叠成 0%）', () => {
    expect(yoyOf(12, 0)).toBeNull()
  })

  it('任一期缺失 ⇒ null（图上留空档，不伪装成 0）', () => {
    expect(yoyOf(null, 10)).toBeNull()
    expect(yoyOf(10, undefined)).toBeNull()
  })

  it('toLookup 跳过空值：缺失项查出来就是「没有前期数据」', () => {
    const lookup = toLookup([
      { time: '2026-03', value: 100 },
      { time: '2026-04', value: null },
    ])
    expect(lookup.has('2026-04')).toBe(false)
    expect(yoyAt(lookup, '2027-04', 'month')).toBeNull()
  })

  it('yoyAt 按 t-12 期取值（快照口径，柱图用）', () => {
    const lookup = toLookup([
      { time: '2026-03', value: 100 },
      { time: '2027-03', value: 110 },
    ])
    expect(yoyAt(lookup, '2027-03', 'month')).toBe(10)
  })
})
