/**
 * 外部数据边界（HTTP 响应 / localStorage / JSON.parse）的 zod 运行时校验 schema。
 * 与 types/ 下 interface 并存，用 z.infer 导出解析类型；zod v4 语法（z.record 双参数、z.looseObject）。
 */
import { z } from 'zod'

import type { TaskDomain, TaskStatus } from '@backend/modules/task/types/task'

/** [lng, lat] 坐标对（route path / water area / route 响应共用的单一形状） */
const lngLatSchema = z.tuple([z.number(), z.number()])

/** 五准则权重形状（defaults 单源与 map 响应 metadata 共用；后端 scoring 同键） */
const suitabilityWeightsShape = {
  inundation: z.number(),
  terrain: z.number(),
  land: z.number(),
  access: z.number(),
  demand: z.number(),
}

// ① User（useAuth 的 localStorage 读取校验 + /auth/me 响应校验）
// @backend-contract backend/src/modules/auth/guards/auth.guard.ts AuthUserView
// 🔴 2026-09-19 修复 P0：createdAt 由 `z.string()` 改为 `z.string().nullable()`——
// 此前必填与后端 `AuthUserView`（created_at 列可空）不符，`/auth/me` 的 200 响应
// 会被 zod 拒绝，走 useAuth 的登出分支 ⇒ 登录后刷新即掉线。放宽是**如实**而非降级。
export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  createdAt: z.string().nullable(),
})

export type UserParsed = z.infer<typeof userSchema>

// ②a 淹没要素 / 受影响设施元素级 schema（D1：替代 z.array(z.unknown()) 浅校验 + as 硬转——
// geometry/coordinates 深字段在 HTTP 边界即把关，畸形数据抛 ApiError(REQUEST_FAILED) 而非穿透渲染）
export const floodGeometrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.array(z.number()))),
  }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(z.array(z.array(z.number())))),
  }),
])

export type FloodGeometryParsed = z.infer<typeof floodGeometrySchema>

// @backend-contract backend/src/modules/flood/services/flood.service.ts FloodFeatureResponse
export const floodFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: floodGeometrySchema,
  // properties：riskLevel 业务必填（FloodFeature 契约，Nest 边界后注入、后端权威）；
  // 但原始响应边界不能强制必填：原 calculate 模式（FastAPI flood_engine 仅返回 {area}）曾因
  // 必填被全部判死（历史回归，2026-08-17 修复）——该模式已随 algorithm-service 退役删除，
  // optional 作为存量数据兼容保留，缺省由 floodAdapter 边界补 DEFAULT_RISK_LEVEL
  // area_deg2：淹没要素面积，ST_Area 原始平方度（d150 改名明确量纲；km² 口径见
  // floodStatisticsResponseSchema.floodArea）。optional：存量 plans 载荷可能无此键。
  properties: z.looseObject({
    riskLevel: z.string().optional(),
    area_deg2: z.number().optional(),
  }),
})

export type FloodFeatureParsed = z.infer<typeof floodFeatureSchema>

export const affectedFacilitySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    lng: z.number(),
    lat: z.number(),
    port: z.string().optional(),
    loss: z.number(),
    damageRate: z.number(),
  })
  // passthrough：保留后端附加字段（elevation/value 等），不剥除
  .passthrough()

export type AffectedFacilityParsed = z.infer<typeof affectedFacilitySchema>

// ③ /flood 在线演算响应 —— 已随 algorithm-service（FastAPI）移除（2026-09-26），编号 ③ 不复用
//（原 schema 业务侧零引用，仅自测；端点为退役只读端点，见 docs/开工前必读/API契约文档.md §5）

// ④ 行政/航线边界 GeoJSON（网络与 sessionStorage 共用同一深校验）
export const boundaryFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: floodGeometrySchema,
  properties: z.record(z.string(), z.unknown()).default({}),
})

export type BoundaryFeatureParsed = z.infer<typeof boundaryFeatureSchema>

export const boundaryFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(boundaryFeatureSchema),
})

export type BoundaryFeatureCollectionParsed = z.infer<typeof boundaryFeatureCollectionSchema>

export const boundaryCacheSchema = z.object({
  data: boundaryFeatureCollectionSchema,
  timestamp: z.number(),
})

export type BoundaryCacheParsed = z.infer<typeof boundaryCacheSchema>

// ⑤ 认证响应（只含 user）：token 已删，认证由 HttpOnly Cookie 承载
export const authResponseSchema = z.object({
  user: userSchema,
})

export type AuthResponseParsed = z.infer<typeof authResponseSchema>

// ⑥ /forecast/timeseries 响应
export const forecastPointSchema = z.object({
  time: z.string(),
  value: z.number(),
  type: z.enum(['historical', 'forecast']),
  // 数据文件自带 confidence（activity.json 等），补可选字段防 schema 静默剥除
  confidence: z.number().optional(),
})

export type ForecastPointParsed = z.infer<typeof forecastPointSchema>

/**
 * 预测数据来源标记（P1-1 降级可观测）：后端四预测端点共用同一字段名。
 * - 'model'：走吞吐量模型产物
 * - 'engine-fallback'：模型不可用，降级趋势外推（页面须显示角标）
 *
 * 可选：activity 等「文件自带真数据」指标不打标记；旧响应也无此字段 ⇒ 两侧都必须容缺。
 */
const forecastDataSourceSchema = z.enum(['model', 'engine-fallback'])

export type ForecastDataSource = z.infer<typeof forecastDataSourceSchema>

/** 预测响应顶层 metadata（可选；当前只有 dataSource 一个事实字段） */
const forecastMetadataSchema = z.object({
  dataSource: forecastDataSourceSchema.optional(),
})

// @backend-contract backend/src/modules/forecast/services/forecast.service.ts ForecastTimeSeriesResponse
export const timeSeriesResponseSchema = z.object({
  indicator: z.string(),
  unit: z.string(),
  granularity: z.string(),
  // 运河情景标识（F5 起响应顶层携带；baseline=无运河增量），前端据此核对回包与请求一致
  canalScenario: z.string(),
  series: z.array(
    z.object({
      portId: z.string(),
      portName: z.string(),
      data: z.array(forecastPointSchema),
    })
  ),
  // P1-1：降级标记（可选；旧响应/文件透传路径不带）
  metadata: forecastMetadataSchema.optional(),
})

export type TimeSeriesResponseParsed = z.infer<typeof timeSeriesResponseSchema>

// ⑦ /forecast/indicator/:indicator 响应
// @backend-contract backend/src/modules/forecast/services/forecast.service.ts ForecastIndicatorResponse
export const indicatorComparisonResponseSchema = z.object({
  indicator: z.string(),
  unit: z.string(),
  canalScenario: z.string(),
  ports: z.record(
    z.string(),
    z.object({
      portName: z.string(),
      value: z.number().nullable(),
      historical: z.array(forecastPointSchema),
      forecast: z.array(forecastPointSchema),
    })
  ),
  // P1-1：降级标记（可选；旧响应不带）
  metadata: forecastMetadataSchema.optional(),
})

export type IndicatorComparisonResponseParsed = z.infer<typeof indicatorComparisonResponseSchema>

// ⑧ /forecast/map 响应（GeoJSON FeatureCollection）
// @backend-contract backend/src/modules/forecast/services/forecast.service.ts ForecastMapResponse
export const forecastMapDataSchema = z.object({
  indicator: z.string(),
  unit: z.string(),
  time: z.string(),
  canalScenario: z.string(),
  type: z.literal('FeatureCollection'),
  // P1-1：降级标记（可选；无 spatial/文件透传路径不带）
  metadata: forecastMetadataSchema.optional(),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      geometry: z.object({
        type: z.string(),
        coordinates: z.array(z.number()),
      }),
      properties: z.object({
        portId: z.string(),
        portName: z.string(),
        value: z.number(),
        // schema 已显式声明；reliability 在旧响应/文件中可缺省
        reliability: z.number().optional(),
      }),
    })
  ),
})

export type ForecastMapDataParsed = z.infer<typeof forecastMapDataSchema>

// ⑨ /forecast/overview 响应
// @backend-contract backend/src/modules/forecast/services/forecast.service.ts ForecastIndexResponse
export const forecastIndicatorIndexSchema = z.object({
  metadata: z.object({
    version: z.string(),
    lastUpdated: z.string(),
    ports: z.array(
      z.object({ id: z.string(), name: z.string(), lat: z.number(), lng: z.number() })
    ),
    indicators: z.array(z.string()),
  }),
  historical: z.object({ start: z.string(), end: z.string() }),
  forecast: z.object({ start: z.string(), end: z.string() }),
  // 首页概览图表快照（useOverviewCharts 消费；looseObject 兼容字段演进）
  charts: z
    .looseObject({
      indicator: z.string(),
      unit: z.string(),
      granularity: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      labels: z.array(z.string()),
      series: z.array(z.looseObject({ name: z.string(), data: z.array(z.number()) })),
    })
    .optional(),
})

export type ForecastIndicatorIndexParsed = z.infer<typeof forecastIndicatorIndexSchema>

// ⑯ /site-suitability/map 响应（新选址单元四加权叠加；格网 GeoJSON）
// @backend-contract backend/src/modules/site-suitability/services/site-suitability.service.ts SuitabilityResult
export const siteSuitabilityResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.looseObject({
      type: z.literal('Feature'),
      geometry: z.looseObject({
        type: z.literal('Point'),
        coordinates: z.array(z.number()),
      }),
      properties: z.looseObject({
        id: z.number(),
        score: z.number(),
      }),
    })
  ),
  metadata: z.looseObject({
    count: z.number(),
    weights: z.looseObject(suitabilityWeightsShape),
    weightsSource: z.string(),
    kdeP99: z.number(),
    minLandFrac: z.number(),
  }),
})

export type SiteSuitabilityResponseParsed = z.infer<typeof siteSuitabilityResponseSchema>

// ㉒ /site-suitability/defaults 默认值单源（权重定稿向量 + 阈值表 + 过滤/分辨率缺省）
// @backend-contract backend/src/modules/site-suitability/services/site-suitability.service.ts SuitabilityDefaults
export const siteSuitabilityDefaultsSchema = z.object({
  weights: z.looseObject(suitabilityWeightsShape),
  thresholds: z.looseObject({
    inundLowM: z.number(),
    inundHighM: z.number(),
    slopeBestDeg: z.number(),
    slopeWorstDeg: z.number(),
    portScaleM: z.number(),
    roadScaleM: z.number(),
  }),
  minLandFrac: z.number(),
  resolution: z.number(),
  source: z.string(),
})

export type SiteSuitabilityDefaultsParsed = z.infer<typeof siteSuitabilityDefaultsSchema>

// ⑰ /diversion/breakdown 响应（分流分析 W10-11；西江转移+三港分摊+桑基流）
// @backend-contract backend/src/common/diversion.ts
// @backend-contract-no-type year 由调用方补上（diversion.service.ts:29 的 DiversionYearResult extends DiversionBreakdown），接口本身没有 year；把年度结果挂到 DiversionBreakdown 上才能逐字段比，但那会让契约比后端接口更宽——现有字段名级核对保留
export const diversionBreakdownResponseSchema = z.object({
  year: z.number(),
  transfer: z.looseObject({
    year: z.number(),
    coal: z.number(),
    grain: z.number(),
    ironOre: z.number(),
    sandCement: z.number(),
  }),
  byPort: z.record(
    z.string(),
    z.looseObject({ coal: z.number(), grain: z.number(), ironOre: z.number(), total: z.number() })
  ),
  sankeyFlows: z.array(z.looseObject({ from: z.string(), to: z.string(), value: z.number() })),
})

export type DiversionBreakdownResponseParsed = z.infer<typeof diversionBreakdownResponseSchema>

// ⑱ /diversion/canal-line 响应（Cesium ③ 弧线几何底座；权威源 = 权威库 canal 表）
// @backend-contract backend/src/common/diversion.ts CanalLineResponse
// 84-only 流通：后端 SQL 已把 4490 存储几何转 4326，此处只收裸 [lng,lat] 对、无 crs 声明
export const canalLineResponseSchema = z.object({
  lines: z.array(
    z.looseObject({
      name: z.string().nullable(),
      section: z.string().nullable(),
      coordinates: z.array(lngLatSchema).min(2),
    })
  ),
})

export type CanalLineResponseParsed = z.infer<typeof canalLineResponseSchema>

// ⑮ /flood/flood-statistics 响应（定义提前：⑩ planSchema 的浸没载荷字段复用本 schema，
// 须先于其求值；编号保持文档序号不变）
// 2026-09-11 起与 flood-areas/disaster 同源：waterLevel 为 251 档实际档位（不再是 6 档粗化值）；
// averageDepth/maxDepth 仍来自 6 档 DEM 反演参考表，由 depthRefLevel 标注其所属档位
// @backend-contract backend/src/modules/flood/services/flood.service.ts FloodStatisticsResponse
// looseObject 而非 strict（W15 登记，2026-10-21）：本端点是字段持续扩张的聚合响应，
// 前端按需读取、未声明的键不参与渲染。必填键（riskLevel 等）改名/改型仍会被咬住 ——
// loose 只放行「后端新增而前端未声明」的键，不放行「已声明键的改名」。若该响应将来进入
// 持久化或参与逐字段校验，须改回 strict 并补全键名。
export const floodStatisticsResponseSchema = z.looseObject({
  waterLevel: z.number().optional(),
  requestedWaterLevel: z.number().optional(),
  actualWaterLevel: z.number().optional(),
  riskLevel: z.string(),
  riskLevelCode: z.number().optional(),
  // 陆域口径（2026-10-05 A3/z048 裁定①）：= 下发几何的裁剪面积汇总（后端 clipped_km2）；
  // DB 全域真值列不再直出
  floodArea: z.number().optional(),
  averageDepth: z.number().optional(),
  maxDepth: z.number().optional(),
  depthRefLevel: z.number().optional(),
  // 参考档水深相对实际档位的低估量（m）；> 0 时面板打 * 并提示（与后端 depthNote 同判据，W19）
  depthUnderstatedBy: z.number().optional(),
  // 计数语义改名 affectedFacilityCount（原 affectedFacilities 与数组语义同名不同型）
  affectedFacilityCount: z.number().optional(),
  affectedPorts: z.array(z.string()).optional(),
  estimatedLoss: z.number().optional(),
  description: z.string().optional(),
})

export type FloodStatisticsResponseParsed = z.infer<typeof floodStatisticsResponseSchema>

// ⑩ /plans CRUD 响应（嵌套复杂字段宽松化）
export const planSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  selectedKeys: z.array(z.string()),
  typeSettings: z.record(z.string(), z.unknown()),
  // savedXiaoqu 必须 optional：存量 plans.json 记录大多无此字段，必填会拒绝旧数据
  savedXiaoqu: z.array(z.unknown()).optional(),
  // weights 由后端持久化（旧数据 null），前端声明但当前不消费
  weights: z.record(z.string(), z.number()).nullable().optional(),
  // 两列在 DDL 里是 TEXT 且无 NOT NULL（tools/db/db-schema.sql:22-23），存量行可为 null；
  // 契约写必填时一条 null 行会让整批 plans 解析失败（W45，同类缺陷 f2093c95 修过一次）
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  businessType: z.string().optional(),
  waterLevel: z.number().optional(),
  totalLoss: z.number().optional(),
  floodRiskLevel: z.string().optional(),
  // 浸没方案载荷（审查 M-1）：此前完全未声明 → PlansPanel 裸 as 硬转 + 畸形数据
  // 静默降级 []。元素级复用既有 schema；畸形存量数据将显式抛 REQUEST_FAILED
  //（空与错误分离），不再静默清空。写入侧为前端自有结构 + 后端 payload 白名单透传
  floodFeatures: z.array(floodFeatureSchema).optional(),
  affectedFacilities: z.array(affectedFacilitySchema).optional(),
  floodStatistics: floodStatisticsResponseSchema.optional(),
})

export type PlanParsed = z.infer<typeof planSchema>

// ⑪ /flood/water-area 响应（[[lng,lat],...] 坐标数组）
// @backend-contract backend/src/modules/flood/services/flood.service.ts
// @backend-contract-no-type 端点返回 WaterAreaResponse（[number, number][] 别名），无对象字段可逐字段比对
export const waterAreaSchema = z.array(lngLatSchema)

export type WaterAreaParsed = z.infer<typeof waterAreaSchema>

// ⑫ /flood/terrain-profiles 响应
// @backend-contract backend/src/modules/flood/services/flood.service.ts
// @backend-contract-no-type 端点返回 TerrainProfilesResponse（记录数组），无顶层对象类型可逐字段比对
export const terrainProfileSchema = z.array(
  z.looseObject({
    id: z.string(),
    name: z.string(),
    port: z.string().optional(),
    description: z.string().optional(),
    points: z.array(
      z.object({ distance: z.number(), lng: z.number(), lat: z.number(), elevation: z.number() })
    ),
  })
)

export type TerrainProfileParsed = z.infer<typeof terrainProfileSchema>

// ⑭ /flood/flood-areas 响应（features 元素级深校验：floodFeatureSchema）
// @backend-contract backend/src/modules/flood/services/flood.service.ts FloodAreasResponse
export const floodAreasResponseSchema = z.looseObject({
  waterLevel: z.number(),
  requestedWaterLevel: z.number().optional(),
  actualWaterLevel: z.number().optional(),
  riskLevel: z.string(),
  features: z.array(floodFeatureSchema),
})

export type FloodAreasResponseParsed = z.infer<typeof floodAreasResponseSchema>

// ⑯ /flood/analysis/disaster 响应（affectedFacilities 元素级深校验：affectedFacilitySchema）
// waterLevel 必须 optional（2026-09-12 契约修复）：后端 assessDisaster 在「档位存在但无淹没」
// （水位 0 等无多边形档）返回 waterLevel: undefined，JSON 序列化即丢弃该键
//（backend/test/flood.e2e-spec.ts 显式断言此行为）。此前此处写必填 → zod 校验失败 →
// 影响评估整段被丢弃、store 保留上一档设施/损失，面板出现「面积水深当前档 + 设施损失上一档」
// 的自相矛盾残留。缺键语义 = 无风险零影响（affectedFacilities/totalLoss 均为空/0），
// 消费方只读后两者（floodAdapter.getImpactAssessment），无需回填档位。
// @backend-contract backend/src/modules/flood/services/flood.service.ts FloodDisasterResponse
export const floodDisasterResponseSchema = z.looseObject({
  waterLevel: z.number().optional(),
  requestedWaterLevel: z.number().optional(),
  riskLevel: z.string(),
  affectedFacilities: z.array(affectedFacilitySchema),
  totalLoss: z.number(),
})

export type FloodDisasterResponseParsed = z.infer<typeof floodDisasterResponseSchema>

// ⑰ /flood-online/api/flood/impact 响应 —— 已随 algorithm-service（FastAPI）移除（2026-09-26），编号 ⑰ 不复用
//（原 schema 业务侧零引用，仅自测；端点为退役只读端点，见 docs/开工前必读/API契约文档.md §5）

// ⑱ 港口数据（前端静态 /data/ports.json，2026-08-29 自后端回迁；mapDataService 消费，C-4/6 补 schema）
export const portSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  lng: z.number(),
  lat: z.number(),
  type: z.string().optional(),
  phone: z.string().optional(),
})

export type PortParsed = z.infer<typeof portSchema>

export const portsArraySchema = z.array(portSchema)

export type PortsArrayParsed = z.infer<typeof portsArraySchema>

// ===== 静态 3D 资产边界（F7：页面经 loadStatic 收口加载时的 zod 校验） =====
/**
 * 3D Tiles tileset JSON 边界：asset.version + 顶层 geometricError + root 为对象。
 * 递归节点细节不设 schema——`prepare*`/`tallyGroups` 的防御分支与单测承接深层结构，
 * 对（无法本地预检的）外部交付包设过严 schema 反而会拒收合法资产。
 */
export const tilesetJsonSchema = z.looseObject({
  asset: z.looseObject({ version: z.string() }),
  geometricError: z.number(),
  root: z.looseObject({}),
})

export type TilesetJsonParsed = z.infer<typeof tilesetJsonSchema>

/** 平陆运河离线影像索引（imagery.json 顶层；条目字段与 PingluImageryEntry 对齐，容忍扩展键） */
export const pingluImageryIndexSchema = z.looseObject({
  tiles: z.array(
    z.looseObject({
      name: z.string(),
      label: z.string(),
      file: z.string(),
      width: z.number(),
      height: z.number(),
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    })
  ),
})

export type PingluImageryIndexParsed = z.infer<typeof pingluImageryIndexSchema>

// ⑲ /api/favorites（全局收藏；同用户下 itemType + itemId 全局唯一，幂等添加）

/**
 * 收藏类型的前端运行期副本（zod 需要运行期元组）。
 *
 * 权威源是后端 `FAVORITE_ITEM_TYPES`（`backend/src/modules/favorites/dto/favorites.dto.ts`）。
 * 本文件属 L0 类型层，不得运行时引后端（dependency-cruiser `types-not-import-backend-runtime`），
 * 故保留这一份**被断言约束**的副本：`__tests__/favoriteItemType.test.ts` 直接 import 后端数组
 * 逐项比对，改任一侧即红。
 */
export const FAVORITE_ITEM_TYPES = ['xiaoqu', 'facility'] as const

export const favoriteItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  itemType: z.enum(FAVORITE_ITEM_TYPES),
  itemId: z.string(),
  name: z.string(),
  // 缺失坐标 null 透传（(0,0) 哨兵禁令——伪坐标会污染地图定位；消费方过滤非有限值）
  lng: z.number().nullable(),
  lat: z.number().nullable(),
  snapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  // 同上：favorites.created_at 为 TEXT NULL（tools/db/db-schema.sql:81），null 须透传
  // 而不是让整批收藏解析失败
  savedAt: z.string().nullable(),
})

export type FavoriteItemParsed = z.infer<typeof favoriteItemSchema>

export const favoritesArraySchema = z.array(favoriteItemSchema)

export type FavoritesArrayParsed = z.infer<typeof favoritesArraySchema>

export const favoriteAddResponseSchema = z.object({
  favorite: favoriteItemSchema,
  existed: z.boolean(),
})

export type FavoriteAddResponseParsed = z.infer<typeof favoriteAddResponseSchema>

export const favoriteRemoveResponseSchema = z.object({
  removed: z.boolean(),
})

export type FavoriteRemoveResponseParsed = z.infer<typeof favoriteRemoveResponseSchema>

// ⑳ GET /route/path 响应（Nest 统一信封）：判别 found 分成功/合法空两路。
// 不可达/未吸附是合法空结果（专项8 7.2 断链语义），不是错误。
// @backend-contract backend/src/modules/route/services/route.service.ts
// @backend-contract-no-type RoutePathResult 是判别联合，字段级比对只支持对象类型；分支字段由调用方自测覆盖
export const routePathResponseSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    mode: z.enum(['distance', 'time']),
    distanceM: z.number(),
    durationMin: z.number(),
    snapDistanceM: z.object({ from: z.number(), to: z.number() }),
    edgeCount: z.number(),
    coordinates: z.array(lngLatSchema),
  }),
  z.object({
    found: z.literal(false),
    reason: z.enum(['origin_not_snapped', 'destination_not_snapped', 'unreachable']),
  }),
])

export type RoutePathResponseParsed = z.infer<typeof routePathResponseSchema>

// ㉑ GET /route/pois 响应（Nest 信封 data 段）：航线分析选点的名称关键词搜索。
// name/type/source 服务端 NOT NULL；district/city 可空（港口/设施点无 city）；坐标 4326（crs 禁令）
// source = 来源点集（port/facility/xiaoqu/poi）：多源合并后前端按来源显示标签
// @backend-contract backend/src/modules/route/repositories/pois-search.repository.ts PoiSearchRow
export const poiSearchItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  source: z.string(),
  city: z.string(),
  district: z.string().nullable(),
  lng: z.number(),
  lat: z.number(),
})

// @backend-contract backend/src/modules/route/repositories/pois-search.repository.ts
// @backend-contract-no-type 端点返回 PoiSearchRow[]，数组包装本身无对象字段；元素契约由 poiSearchItemSchema 核对
export const poiSearchResponseSchema = z.array(poiSearchItemSchema)

export type PoiSearchItemParsed = z.infer<typeof poiSearchItemSchema>

export type PoiSearchResponseParsed = z.infer<typeof poiSearchResponseSchema>

/**
 * 任务状态/域的前端运行期副本（zod 需要运行期元组）。
 *
 * 权威源是后端 `backend/src/modules/task/types/task.ts`；本文件属 L0 类型层，
 * 不得运行时引后端，故保留这份**被断言约束**的副本——`__tests__/taskConstants.test.ts`
 * 直接 import 后端数组逐项比对，改任一侧即红。生产代码的运行时值/谓词走
 * `shared/task.ts`（type-only 之外的另一条通道），不从这里取。
 */
export const TASK_STATUSES = [
  'pending',
  'running',
  'retrying',
  'done',
  'failed',
  'cancelled',
] as const satisfies readonly TaskStatus[]

export const TASK_DOMAINS = [
  'flood-areas',
  'route-path',
  'site-suitability-map',
] as const satisfies readonly TaskDomain[]

// ⑯ /task 三个端点（提交 / 查询 / 取消）的响应契约。
//
// 为什么补：useTaskApi 的三个请求点此前只有 TS 泛型（`apiRequest<TaskView>`），
// 编译期形状对不上不会报错，运行期更不会——后端把字段改名/删掉时，前端表现为
// 「任务成功但没结果」，比报错更难查（types/task.ts 头注释即为此写的维护约束）。
// 必填字段按后端 TaskView / TaskSubmitResponse 原样声明（不 optional 化）：
// 只有必填才能让"后端字段消失"在运行期直接抛错。
// @backend-contract backend/src/modules/task/types/task.ts TaskSubmitResponse
export const taskSubmitResponseSchema = z.looseObject({
  taskId: z.string(),
  status: z.enum(TASK_STATUSES),
  queuePosition: z.number(),
  // epoch-ms；与 user/plan 的 ISO string createdAt 同名异义，Ms 后缀区分（1004-F11）
  createdAtMs: z.number(),
})

export type TaskSubmitResponseParsed = z.infer<typeof taskSubmitResponseSchema>

// @backend-contract backend/src/modules/task/types/task.ts TaskView
export const taskViewResponseSchema = z.looseObject({
  taskId: z.string(),
  domain: z.enum(TASK_DOMAINS),
  route: z.string(),
  status: z.enum(TASK_STATUSES),
  progress: z.number(),
  queuePosition: z.number().optional(),
  retryCount: z.number(),
  result: z.unknown().optional(),
  error: z
    .looseObject({
      message: z.string(),
      bizCode: z.number().optional(),
    })
    .optional(),
  createdAtMs: z.number(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
})

export type TaskViewResponseParsed = z.infer<typeof taskViewResponseSchema>
