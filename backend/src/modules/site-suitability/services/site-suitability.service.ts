import { Injectable, Logger } from '@nestjs/common'

import { DEFAULT_THRESHOLDS, type ScoreThresholds } from '../constants/score.constants'
import {
  DEFAULT_MAX_LAND_FRAC,
  DEFAULT_MAX_PORT_DISTANCE_KM,
  DEFAULT_MIN_LAND_FRAC,
  DEFAULT_RESOLUTION,
  defaultWeights,
  type SuitabilityQuery,
} from '../dto/site-suitability.dto'
import { SiteSuitabilityRepository } from '../repositories/site-suitability.repository'

import { type CellScore, type FactorCell, parseWeights, type SuitabilityWeights } from './scoring'
import { cellScore } from './scoring'

/** km → m；0 表示不设上限（与 SQL 的 `dist_port_m <= $3` 对齐，用 Infinity 表达） */
function toMeters(km: number): number {
  return km > 0 ? km * 1000 : Number.POSITIVE_INFINITY
}

// 加权叠加编排（单元四）：库行 → 纯函数评分 → GeoJSON FeatureCollection。
// 计算全在内存（148k 行算术），出参形状为契约 siteSuitabilityResponseSchema（前端
// types/schemas.ts，@backend-contract 反向核对指向本文件）。

export interface SuitabilityResult {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { id: number; score: number } & Partial<CellScore['sub']>
  }>
  metadata: {
    count: number
    weights: SuitabilityWeights
    weightsSource: 'query' | 'ahp-default'
    kdeP99: number
    minLandFrac: number
    /** 陆地占比上限（回显实际筛选口径，前端据此说明"只留与水相邻的格"） */
    maxLandFrac: number
    /** 距最近既有港口上限（km，回显实际筛选口径） */
    maxPortDistanceKm: number
    /** 实际使用的聚合分辨率（度）；0 = 全分辨率 */
    resolution: number
  }
}

/** GET /defaults 出参（前端 siteSuitabilityDefaultsSchema 逐字段反向核对） */
export interface SuitabilityDefaults {
  weights: Record<string, number>
  thresholds: ScoreThresholds
  minLandFrac: number
  maxLandFrac: number
  maxPortDistanceKm: number
  resolution: number
  source: string
}

@Injectable()
export class SiteSuitabilityService {
  private readonly logger = new Logger(SiteSuitabilityService.name)

  constructor(private readonly repository: SiteSuitabilityRepository) {}

  async compute(query: SuitabilityQuery): Promise<SuitabilityResult> {
    const weights: SuitabilityWeights = parseWeights(query.weights)
    const [rows, kdeP99] = await Promise.all([
      this.repository.fetchCellsAt(
        query.minLandFrac,
        query.maxLandFrac,
        query.resolution,
        toMeters(query.maxPortDistanceKm)
      ),
      this.repository.fetchKdeP99(),
    ])

    // 高程/坡度是评分必要因子：库列可空，NULL 会被比较运算伪装成最差/最宜分。
    // 缺失格不参与排序（K1 A6/B8），不能填 0 或用中性值造出第二套口径。
    const scorableRows = rows.filter(
      (
        row
      ): row is typeof row & {
        mean_elev_m: number
        mean_slope_deg: number
      } => Number.isFinite(row.mean_elev_m) && Number.isFinite(row.mean_slope_deg)
    )
    const omitted = rows.length - scorableRows.length
    if (omitted > 0) {
      this.logger.warn(`选址评分跳过 ${omitted} 个缺高程/坡度格（不参与排序）`)
    }

    const features = scorableRows.map((row) => {
      const cell: FactorCell = {
        // 契约归一：库列 bigint（pg 驱动给字符串）→ 出参 schema 声明 number。
        // id 现值量级 ≤ 1.5e5（远小于 2^53），Number() 无精度风险。
        id: Number(row.id),
        meanElevM: row.mean_elev_m,
        meanSlopeDeg: row.mean_slope_deg,
        landFrac: row.land_frac,
        landClass: row.land_class,
        distPortM: row.dist_port_m,
        distRoadM: row.dist_road_m,
        kdeMass: row.kde_mass,
      }
      const cs: CellScore = cellScore(cell, weights, kdeP99)
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [row.lon, row.lat] as [number, number] },
        properties: { id: cs.id, score: cs.score, ...cs.sub },
      }
    })

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        count: features.length,
        weights,
        weightsSource: query.weightsSource,
        kdeP99,
        minLandFrac: query.minLandFrac,
        maxLandFrac: query.maxLandFrac,
        maxPortDistanceKm: query.maxPortDistanceKm,
        // 回显实际聚合口径：0 = 全分辨率；前端可据此提示"当前为聚合视图"
        resolution: query.resolution,
      },
    }
  }

  /**
   * 默认值单源（GET /site-suitability/defaults）：权重定稿向量 + 阈值表 +
   * 过滤/分辨率缺省。前端 store 以此为准；拉不到时用同值快照兜底（快照见
   * frontend/src/stores/siteSuitabilityDefaults.snapshot.ts，
   * 成功/兜底在日志可区分，UI 无区别）。
   */
  getDefaults(): SuitabilityDefaults {
    return {
      weights: defaultWeights(),
      thresholds: DEFAULT_THRESHOLDS,
      minLandFrac: DEFAULT_MIN_LAND_FRAC,
      maxLandFrac: DEFAULT_MAX_LAND_FRAC,
      maxPortDistanceKm: DEFAULT_MAX_PORT_DISTANCE_KM,
      resolution: DEFAULT_RESOLUTION,
      source: 'SITE_AHP_MATRIX@2026-09-30',
    }
  }
}
