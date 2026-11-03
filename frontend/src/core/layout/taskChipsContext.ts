/**
 * 任务结果芯片的跨层供给（App → AppLayout 控制台）。
 *
 * 为什么走 provide/inject 而不是 store：`core` 不接 store（TaskResultChip/TaskDock 先例），
 * 芯片数据的唯一真相源在 App.vue（taskStore 终态槽位 → IR → 视图模型），
 * AppLayout 只是它的另一个**渲染面**：桌面档挂在右下浮条（App.vue 自己渲染），
 * 手机档挂进控制台（本文件的下游）。同一份 computed 两处消费，不做第二份派生。
 */
import type { ComputedRef, InjectionKey } from 'vue'

/** 单个芯片的视图模型（与 TaskResultChip 的 props 同形，不含 IR 本体） */
export interface TaskChipView {
  key: string
  label: string
  color: string
  active: boolean
}

/** 中转带芯片被拖到某点：key 是芯片的图层 key，x/y 是视口坐标（判距 + 命中用） */
export interface ChipDragPoint {
  key: string
  x: number
  y: number
}

interface TaskChipsContext {
  chips: ComputedRef<TaskChipView[]>
  /** 上图 ⇄ 撤下的开关；参数是芯片 key（IR id） */
  toggle: (key: string) => void
}

/**
 * 缺省不 provide（如单测里单独挂 AppLayout）时 inject 为 undefined：
 * 控制台就不渲染中转带，而不是渲染一条永远为空的带子。
 */
export const GCS_TASK_CHIPS_KEY: InjectionKey<TaskChipsContext> = Symbol('gcs-task-chips')
