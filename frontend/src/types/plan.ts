import type { PlanParsed } from './schemas'
import type { SavedXiaoqu } from './xiaoqu'

// 重新导出类型，方便其他模块引用
export type { SavedXiaoqu } from './xiaoqu'

// 方案：字段以 planSchema 为唯一契约。savedXiaoqu 在 schema 里是存量兼容的 unknown[]，
// 消费侧需要强类型视图，故仅对这一字段做显式收窄（写入边界由 usePlans 校验）。
export type Plan = Omit<PlanParsed, 'savedXiaoqu'> & { savedXiaoqu?: SavedXiaoqu[] }
