/**
 * 任务状态/域的运行期值与谓词（前端边界适配层）。
 *
 * 为什么需要它：`frontend/src/types/` 是 L0 纯类型层——运行时值必须可整体擦除，
 * 否则 `import type` 不再安全、types 层也不能只靠 TS 剥离。权威源在后端
 * `backend/src/modules/task/types/task.ts`，此前由 `types/task.ts` 直接 re-export 运行时，
 * 让 L0 层对后端实现产生静态依赖（架构审查发现的 L0 越界）。
 *
 * 现在：`types/task.ts` 只 type-only 引后端；生产消费者从这里取运行时值/谓词。
 * 刻意不并入 `shared/constants` 或 `shared/index` barrel：收进来会让任何 barrel 消费者
 * 把后端模块拖进图（tree-shaking 之外的边界污染）。新代码直接 `import ... from '@/shared/task'`。
 */
export {
  TASK_STATUSES,
  TASK_DOMAINS,
  isActiveStatus,
  isTerminalStatus,
} from '@backend/modules/task/types/task'
