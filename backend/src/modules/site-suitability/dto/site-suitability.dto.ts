// 加权叠加端点入参解析（单元四）：五准则权重经 query 传入（GET 语义：可缓存可分享），
// 缺省回落 AHP 定稿矩阵的特征向量权重（SITE_AHP_MATRIX，2026-09-30 定稿，
// 依据链见 site-ahp.constants.ts 文件头）。
import { ahpWeights } from '../../../common/ahp'
import { SITE_AHP_MATRIX, SITE_CRITERIA } from '../../../common/constants/site-ahp.constants'
import { BusinessError, ErrorCode } from '../../../common/errors/business-error'
// 维度键收为模块内单一来源（2026-10-13 收口 B3）：原先此处与 scoring.ts 各手抄一份
import { WEIGHT_KEYS } from '../constants/score.constants'
import { isUnitInterval } from '../constants/unit-interval'

/**
 * 解析缺省值单源（04-B3）：parse 与 GET /defaults 共用，禁止在别处再手抄 0.5/0。
 * 前端快照（defaults.snapshot.ts）是此间定稿值的发布副本，对齐守卫见后端 defaults 单测。
 */
export const DEFAULT_MIN_LAND_FRAC = 0.5
/**
 * 陆地占比上限（缺省 0.99）：只留"格里有水"的格子。
 *
 * 为什么要这条：480m 格的 land_frac = 1 表示整格都是陆地——这类格子可能是内陆城区、
 * 也可能是离岸很远的农田，选出来的"港口候选"没有岸线可用（用户实测反馈：候选点落在
 * 市区和内陆）。0.99 的判据是"格内至少有一丝水体"，等价于水陆交界带；纯水格仍由
 * min_land_frac 下限挡住。上下限都来自 query，缺省值此处与 defaults 端点同源。
 */
export const DEFAULT_MAX_LAND_FRAC = 0.99
/**
 * 距最近既有港口的上限（km）缺省 50。
 *
 * 为什么是硬约束而不是只靠 access 权重：权重只有 1/5，内陆格在土地/地形两项可以拿满分，
 * 距离再远也压不住——实测 land_frac 过滤后仍有 3,572 格，到港口中位 60.8km、最远 150.3km。
 * 用户要求「距离太远的不该选出来」，这类格即便入图也没有配套可用。
 * 50km 为作者设定（港口集疏运 1 小时公路圈量级），不是数据推导值；改它需同步 UI 口径文字。
 */
export const DEFAULT_MAX_PORT_DISTANCE_KM = 50
export const DEFAULT_RESOLUTION = 0

export interface SuitabilityQuery {
  weights: Record<string, number>
  minLandFrac: number
  /** 陆地占比上限：land_frac > 本值的格不入图（缺省 0.99 = 只留与水相邻的格） */
  maxLandFrac: number
  /** 距最近既有港口上限（km）：dist_port_m > 本值的格不入图（缺省 50，作者设定） */
  maxPortDistanceKm: number
  /** 聚合分辨率（度）。0 = 全分辨率（默认，保持既有消费方行为）；>0 = 按该边长的粗格聚合 */
  resolution: number
  /** 权重来源（metadata.weightsSource 同值域；幽灵标签修复前 service 恒写 ahp-final） */
  weightsSource: 'query' | 'ahp-default'
}

/** AHP 定稿特征向量权重（顺序对应 SITE_CRITERIA：浸没/地形/土地/可达/需求） */
export function defaultWeights(): Record<string, number> {
  const { weights } = ahpWeights(SITE_AHP_MATRIX)
  return Object.fromEntries(SITE_CRITERIA.map((k, i) => [CRITERION_KEY[k] ?? k, weights[i]]))
}

// 中文准则标签 → 入参键（与 parseWeights 五键对齐）
const CRITERION_KEY: Record<string, string> = {
  浸没风险: 'inundation',
  高程地形: 'terrain',
  土地适宜: 'land',
  交通可达: 'access',
  需求引力: 'demand',
}

export function parseSuitabilityQuery(query: Record<string, unknown>): SuitabilityQuery {
  const weights: Record<string, number> = {}
  let anyGiven = false
  for (const k of WEIGHT_KEYS) {
    const raw = query[`w_${k}`]
    if (raw !== undefined && raw !== '') {
      anyGiven = true
      const v = Number(raw)
      if (!Number.isFinite(v)) throw new BusinessError(ErrorCode.INVALID_PARAMS, `w_${k} 非数值`)
      weights[k] = v
    }
  }
  if (!anyGiven) {
    return {
      weights: defaultWeights(),
      ...landFracBounds(query),
      maxPortDistanceKm: parseMaxPortDistanceKm(query.max_port_distance_km),
      resolution: parseResolution(query.resolution),
      weightsSource: 'ahp-default',
    }
  }
  for (const k of WEIGHT_KEYS) {
    if (weights[k] === undefined) weights[k] = 0
  }
  return {
    weights,
    ...landFracBounds(query),
    maxPortDistanceKm: parseMaxPortDistanceKm(query.max_port_distance_km),
    resolution: parseResolution(query.resolution),
    weightsSource: 'query',
  }
}

/**
 * 聚合分辨率解析（性能治本，2026-10-02）：全量 14 万格 ≈ 28.8MB 响应，浏览器解析即卡。
 * 渲染热力图不需要原始格 ⇒ 允许按要求聚合。0（缺省）= 全分辨率；上限 1°（再粗无意义）。
 */
function parseResolution(raw: unknown): number {
  if (raw === undefined || raw === '') return DEFAULT_RESOLUTION
  const v = Number(raw)
  if (!isUnitInterval(v))
    throw new BusinessError(ErrorCode.INVALID_PARAMS, 'resolution 须 ∈ (0,1]，或 0 表示全分辨率')
  return v
}

/**
 * 陆地占比的上下限一起解析：两者有顺序约束（上限必须 ≥ 下限），
 * 分开返回会让"下限 0.95 + 上限 0.5"这种矛盾组合静默变成空集。
 */
function landFracBounds(query: Record<string, unknown>): {
  minLandFrac: number
  maxLandFrac: number
} {
  const minLandFrac = parseMinLandFrac(query.min_land_frac)
  const maxLandFrac = parseMaxLandFrac(query.max_land_frac)
  if (maxLandFrac < minLandFrac) {
    throw new BusinessError(
      ErrorCode.INVALID_PARAMS,
      'max_land_frac 须 ≥ min_land_frac（否则筛选结果恒为空）'
    )
  }
  return { minLandFrac, maxLandFrac }
}

/**
 * 港口距离上限解析：0 表示不设上限（显式复现旧行为，便于口径对照）。
 * 上限 500km 是防呆：再远已经跨出北部湾经济区，写错单位（米当千米）也能被这条挡住。
 */
function parseMaxPortDistanceKm(raw: unknown): number {
  if (raw === undefined || raw === '') return DEFAULT_MAX_PORT_DISTANCE_KM
  const v = Number(raw)
  if (!Number.isFinite(v) || v < 0 || v > 500) {
    throw new BusinessError(ErrorCode.INVALID_PARAMS, 'max_port_distance_km 须 ∈ [0,500]')
  }
  return v
}

function parseMaxLandFrac(raw: unknown): number {
  if (raw === undefined || raw === '') return DEFAULT_MAX_LAND_FRAC
  const v = Number(raw)
  if (!isUnitInterval(v)) {
    throw new BusinessError(ErrorCode.INVALID_PARAMS, 'max_land_frac 须 ∈ [0,1]')
  }
  return v
}

function parseMinLandFrac(raw: unknown): number {
  if (raw === undefined || raw === '') return DEFAULT_MIN_LAND_FRAC
  const v = Number(raw)
  if (!isUnitInterval(v)) {
    throw new BusinessError(ErrorCode.INVALID_PARAMS, 'min_land_frac 须 ∈ [0,1]')
  }
  return v
}
