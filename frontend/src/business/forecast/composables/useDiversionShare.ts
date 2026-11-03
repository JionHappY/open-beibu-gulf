/**
 * 分流份额（G2）：分流分析不再单开一页，结论并进预测页。
 *
 * 为什么按「年」取而不是按月：后端 /diversion/breakdown 只按年插值（西江转移量是年度锚点），
 * 同一年内换月得到的仍是同一个数，按月发请求等于白打一次流量。
 *
 * 为什么自带缓存：预测页默认自动播放（500ms/帧），一年 12 帧。按年缓存后
 * 每跨一年才发一次请求，而不是每帧一次。
 *
 * 为什么不用 forecast 的请求事务：它是另一组量的接口，与预测三路（timeseries/comparison/map）
 * 的生命周期无关；混进同一事务只会让预测的 loading 跟着这个附加面板一起闪。
 */
import { computed, ref, watch } from 'vue'
import { ENDPOINTS, useApiRequest } from '@/shared'
import type { DiversionBreakdownResponseParsed } from '@/types/schemas'
import { diversionBreakdownResponseSchema } from '@/types/schemas'
import { useForecastStore } from '@/stores/forecastStore'

/** 后端端口 id → 中文名；未登记的 id 原样透出（不吞数据） */
const PORT_NAMES: Record<string, string> = {
  qinzhou: '钦州',
  fangchenggang: '防城港',
  beihai: '北海',
}

interface PortShare {
  id: string
  name: string
  /** 该港分到的转移量（万吨） */
  total: number
  /** 占三港合计的比例 0–1 */
  share: number
}

export function useDiversionShare() {
  const forecastState = useForecastStore()
  const { apiRequest } = useApiRequest()

  /** 预测当前时点的年份：月粒度串 "2027-05" 取前四位 */
  const year = computed(() => Number(forecastState.currentTime.slice(0, 4)))

  const data = ref<DiversionBreakdownResponseParsed | null>(null)
  const cache = new Map<number, DiversionBreakdownResponseParsed>()

  const ports = computed<PortShare[]>(() => {
    const byPort = data.value?.byPort
    if (!byPort) return []
    const sum = Object.values(byPort).reduce((acc, p) => acc + p.total, 0)
    return Object.entries(byPort)
      .map(([id, p]) => ({
        id,
        name: PORT_NAMES[id] ?? id,
        total: p.total,
        share: sum > 0 ? p.total / sum : 0,
      }))
      .sort((a, b) => b.total - a.total)
  })

  /** 三港合计（= 西江转移量总量，万吨） */
  const total = computed(() => ports.value.reduce((acc, p) => acc + p.total, 0))

  async function load(y: number): Promise<void> {
    const hit = cache.get(y)
    if (hit) {
      data.value = hit
      return
    }
    try {
      const res = await apiRequest<DiversionBreakdownResponseParsed>(
        ENDPOINTS.diversion.breakdown,
        {
          method: 'GET',
          params: { year: y },
          schema: diversionBreakdownResponseSchema,
        }
      )
      cache.set(y, res)
      // 回包时用户可能已经拖到别的年份：只接收当前年份的结果，避免旧年数据盖新年
      if (Number(forecastState.currentTime.slice(0, 4)) === y) data.value = res
    } catch {
      // 份额是附加结论：失败时保留上一次的数值，不弹全局错误（预测主结论仍可用）
    }
  }

  watch(year, (y) => void load(y), { immediate: true })

  return { year, data, ports, total }
}
