/**
 * useForecastComparison — 港口对比（柱状图）数据 composable：
 * 请求经 forecastAdapter（service 层隔离），组件零 HTTP/字段细节；缓存存 store；
 * 双真指标并行请求共享事务，任一过期整体跳过渲染。429 播放限流静默降级与页面原实现一致。
 */
import { useRouter } from 'vue-router'

import { forecastAdapter } from '@/services'
import { ApiError, DEFAULT_CONFIDENCE, logger, showError } from '@/shared'
import { PORT_KEYS, PORT_NAMES } from '@/shared'
import { useForecastStore } from '@/stores'
import type { ChartSeries } from '@/types'
import type { ForecastDataSource } from '@/types/schemas'

/** 返回契约（显式化，防重构时签名静默漂移）。v4-S3：结果写 store.chart，不再持本地 ref */
interface UseForecastComparisonReturn {
  load: (transactionId: number, signal: AbortSignal) => Promise<void>
}

import { guardForecastAuth, useForecastRequest } from './useForecastRequest'
import { toLookup, yoyAt } from '../yoy'

// 柱状图固定对比真实吞吐量指标（cargo/container；合成数据不入图），当前 3 港 × 2 指标 = 6 柱
const BAR_INDICATORS = ['cargo', 'container'] as const
const BAR_INDICATOR_LABELS: Record<string, string> = {
  cargo: '货物吞吐量',
  container: '集装箱吞吐量',
}

type ComparisonResult = Awaited<ReturnType<typeof forecastAdapter.getIndicatorComparison>>
type PortSeries = {
  historical: Array<{ time: string; value: number }>
  forecast: Array<{ time: string; value: number }>
}

/**
 * 全序列缓存键：接口响应本来就带回每港 historical+forecast 全量，按时点取一个值不该
 * 每帧重打一次接口（自动播放每 500ms 一帧 ⇒ 每帧 2 个指标各一次）。
 * 置信度/运河情景会改变数值，必须进键。
 */
function fullCacheKey(indicator: string, confidence: number, scenario: string): string {
  return `cmpfull:${indicator}:${confidence}:${scenario}`
}

/** 与后端 aggregateYearPoint 同口径：年模式取该年 12 个月的合计，无则 null */
function valueAtTime(port: PortSeries, time: string, isYear: boolean): number | null {
  const all = [...port.historical, ...port.forecast]
  if (isYear) {
    const matched = all.filter((d) => d.time.startsWith(`${time}-`))
    return matched.length ? matched.reduce((sum, d) => sum + d.value, 0) : null
  }
  return all.find((d) => d.time === time)?.value ?? null
}

export function useForecastComparison(): UseForecastComparisonReturn {
  const router = useRouter()
  const forecastState = useForecastStore()
  const { runInTransaction, isTransactionValid } = useForecastRequest()

  async function load(transactionId: number, signal: AbortSignal): Promise<void> {
    try {
      // 年模式直接传 "YYYY"：后端按 12 个月合计返回，禁止用 YYYY-12 冒充年度
      const time = forecastState.currentTime
      const confKey = BAR_INDICATORS.map(
        (i) => forecastState.confidenceThresholds[i] ?? DEFAULT_CONFIDENCE
      ).join(',')
      // 运河情景只影响 cargo 柱（container 无文献锚点，后端拒绝），缓存键须随情景区分
      const scenario = forecastState.canalScenario || 'baseline'
      const cacheKey = `cmp:${time}:${confKey}:${scenario}`
      const cached = forecastState.requestCache.get(cacheKey)
      // 增速视图不能用绝对值缓存：同比要 t 与 t-12 两期，缓存里只存了渲染好的绝对值
      if (cached && !forecastState.growthMode) {
        // 事务检查：即使缓存命中也要验证事务有效性
        if (!isTransactionValid(transactionId)) return
        const c = cached as {
          xData: string[]
          series: ChartSeries[]
          barUnit?: string
          barUnitRight?: string
          dataSource?: ForecastDataSource
        }
        forecastState.chart.barXData = c.xData
        forecastState.chart.barSeries = c.series
        forecastState.chart.barUnit = c.barUnit ?? ''
        forecastState.chart.barUnitRight = c.barUnitRight ?? ''
        // P1-1：缓存命中同样恢复降级标记（首帧与重放同口径）
        forecastState.chart.barDataSource = c.dataSource ?? null
        return
      }
      // 双真指标并行取「全序列」（每指标一次，缓存 50 条 LRU 兜底）；
      // 当前时点的六个柱值在本地取，播放推帧不再发请求
      const results = await Promise.all(
        BAR_INDICATORS.map(async (ind) => {
          const confidence = forecastState.confidenceThresholds[ind] || DEFAULT_CONFIDENCE
          const key = fullCacheKey(ind, confidence, scenario)
          const cached = forecastState.requestCache.get(key) as ComparisonResult | undefined
          if (cached) return cached
          const full = await runInTransaction(
            () =>
              forecastAdapter.getIndicatorComparison(
                ind,
                {
                  confidence,
                  // cargo 携带情景；container 无运河参数口径（04-B10），恒按基线请求
                  ...(ind === 'cargo' && scenario !== 'baseline' ? { scenario } : {}),
                },
                signal
              ),
            transactionId
          )
          if (full) forecastState.requestCache.set(key, full)
          return full
        })
      )
      // 任一请求事务过期 → 整体跳过本次渲染（等下一次状态变化）
      if (results.some((r) => r === null)) return
      forecastState.chart.barXData = [...PORT_NAMES]
      // 全序列 → 当前时点的六个柱值（年模式按 12 个月合计，口径与后端一致）
      const isYear = /^\d{4}$/.test(time)
      const picked = results.map((r) => {
        const ports = Object.fromEntries(
          Object.entries(r!.ports).map(([pid, port]) => [
            pid,
            { ...port, value: valueAtTime(port as PortSeries, time, isYear) },
          ])
        )
        return {
          ...r!,
          ports,
          unit: isYear && !r!.unit.endsWith('/年') ? `${r!.unit}/年` : r!.unit,
        }
      })

      // F4：两指标量纲不同（万吨 / TEU），单轴会把小量纲 cargo 压成不可见 ⇒
      // 改为左右双轴：cargo 走左轴、container 走右轴；单位只标在轴上，系列名保持简洁。
      // 两轴单位取自接口 unit（不硬编码，防后端改口径后名实不符）
      forecastState.chart.barUnit = picked[0].unit ?? ''
      forecastState.chart.barUnitRight = picked[1].unit ?? ''
      // P1-1：cargo/container 模型产物各自独立 ⇒ 任一降级即柱图整体标降级
      const barSources = results.map((r) => r?.dataSource)
      forecastState.chart.barDataSource = barSources.includes('engine-fallback')
        ? 'engine-fallback'
        : barSources.includes('model')
          ? 'model'
          : null
      // 同比视图：两指标都变成百分比 ⇒ 量纲统一，左右双轴没有意义，全部收回左轴
      const growth = forecastState.growthMode
      // 粒度固定为月（年入口已移除，见 G1）
      const granularity = 'month' as const
      if (growth) {
        forecastState.chart.barUnit = '%'
        forecastState.chart.barUnitRight = ''
      }
      forecastState.chart.barSeries = BAR_INDICATORS.map((ind, i) => {
        const r = picked[i]
        const p = r.ports
        return {
          name: BAR_INDICATOR_LABELS[ind],
          // 无数据保留 null（图表空档），不再折叠为 0——
          // 后端 value 缺失时 `|| 0` 会把「无数据」伪装成「真实 0」。
          // 按 PORT_KEYS 取数：顺序与 barXData（PORT_NAMES）由同一权威源派生
          data: PORT_KEYS.map((k) => {
            if (!growth) return p?.[k]?.value ?? null
            const port = p?.[k]
            const lookup = toLookup([...(port?.historical ?? []), ...(port?.forecast ?? [])])
            return yoyAt(lookup, forecastState.currentTime, granularity)
          }),
          // container 量纲不同（TEU）绑右轴；cargo 留默认左轴（index 0）
          ...(ind === 'container' && !growth ? { yAxisIndex: 1 } : {}),
        }
      })
      forecastState.setRequestCache(cacheKey, {
        xData: forecastState.chart.barXData,
        series: forecastState.chart.barSeries,
        barUnit: forecastState.chart.barUnit,
        barUnitRight: forecastState.chart.barUnitRight,
        dataSource: forecastState.chart.barDataSource,
      })
    } catch (e) {
      logger.error('[ForecastComparison] load error:', e)
      if (guardForecastAuth(e, router)) return
      // 播放中命中后端限流（429）：静默降级不弹窗（同 useForecastLayer）
      if (forecastState.isPlaying && e instanceof ApiError && e.message.includes('过于频繁')) {
        return
      }
      // 失败用 toast：切换时间/指标即自动重试
      showError(e, { fallback: '加载对比数据失败' })
    }
  }

  return { load }
}
