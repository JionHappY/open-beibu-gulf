/**
 * 同比增速（第四张指标卡走这里）：把「同一序列的 t 与 t-12 期」算成百分比。
 *
 * 为什么单独一件而不是在 composable 里各算一遍：折线（逐点窗口）和柱图（单时点快照）
 * 两处要同一条口径（月粒度退 12 个月、年粒度退 1 年、缺失留空档而不是 0），
 * 两份手抄就是两个结果，图上对不上。
 */
import { fromMonthOrdinal, toMonthOrdinal } from './timeline'

type YoyGranularity = 'month' | 'year'

interface YoyPoint {
  time: string
  value: number | null | undefined
}

/** 时间→值。缺失项不进表 ⇒ 查不到就是「没有前期数据」 */
type YoyLookup = Map<string, number>

/** t-12 期的时间键（月粒度退 12 个月，年粒度退 1 年） */
export function shiftBack12(time: string, granularity: YoyGranularity): string {
  if (granularity === 'year') return String(Number(time.slice(0, 4)) - 1)
  const [year, month] = time.split('-').map(Number)
  const [py, pm] = fromMonthOrdinal(toMonthOrdinal(year, month) - 12)
  return `${py}-${String(pm).padStart(2, '0')}`
}

export function toLookup(points: readonly YoyPoint[]): YoyLookup {
  const lookup: YoyLookup = new Map()
  for (const p of points) {
    if (p.value !== null && p.value !== undefined) lookup.set(p.time, p.value)
  }
  return lookup
}

/**
 * 同比百分比（1 位小数）。
 * 前期为 0 或任一缺失 ⇒ null：图上留空档，不把「没有可比基期」画成 0% 或 -100%。
 */
export function yoyOf(
  current: number | null | undefined,
  previous: number | null | undefined
): number | null {
  if (current === null || current === undefined) return null
  if (previous === null || previous === undefined || previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/** 某时点的同比（快照口径，柱图用） */
export function yoyAt(lookup: YoyLookup, time: string, granularity: YoyGranularity): number | null {
  return yoyOf(lookup.get(time), lookup.get(shiftBack12(time, granularity)))
}
