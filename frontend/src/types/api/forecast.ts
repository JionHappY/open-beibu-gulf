/**
 * 预测分析数据模型，对应 public/data/forecast/*.json 的真实结构。
 *
 * 只留地图热力图响应：原 `PortId`（= string 纯别名）与 `ForecastPoint` 全仓零消费
 * （后端同名件在 forecast-engine.ts，是另一件），2026-10-19 必要性审判删除。
 */
import type { ForecastMapDataParsed } from '../schemas'

/** 地图热力图响应：字段以 forecastMapDataSchema 为唯一契约（reliability 可缺省） */
export type ForecastMapData = ForecastMapDataParsed
