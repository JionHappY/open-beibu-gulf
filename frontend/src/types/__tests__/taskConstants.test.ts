/**
 * 任务状态/域「前端 zod 副本 == 后端权威数组」。
 *
 * `types/` 是 L0 纯类型层，不得运行时引后端；但 zod 的 `z.enum` 需要运行期元组，
 * 故 `types/schemas.ts` 保留一份副本。本测试直接 import 后端权威数组逐项比对：
 * 后端加/删/改任一状态或域而前端未同步 ⇒ 红。
 *
 * 生产代码的运行时值/谓词不从这里取，走 `shared/task.ts`（re-export 后端）。
 * 失效条件：前端改用生成物派生 ⇒ 判据面改为比对生成物，本条作废。
 */
import { describe, expect, it } from 'vitest'

import {
  TASK_DOMAINS as BACKEND_TASK_DOMAINS,
  TASK_STATUSES as BACKEND_TASK_STATUSES,
} from '@backend/modules/task/types/task'

import {
  TASK_DOMAINS,
  TASK_STATUSES,
  taskSubmitResponseSchema,
  taskViewResponseSchema,
} from '../schemas'

describe('任务状态/域跨端单源', () => {
  it('🔴 @guard-red-sample 状态数组与后端权威逐项相等', () => {
    expect(BACKEND_TASK_STATUSES.length).toBeGreaterThan(0)
    expect(TASK_STATUSES).toEqual(BACKEND_TASK_STATUSES)
    for (const [i, value] of BACKEND_TASK_STATUSES.entries()) {
      expect(TASK_STATUSES[i]).toBe(value)
    }
  })

  it('🔴 @guard-red-sample 域数组与后端权威逐项相等', () => {
    expect(BACKEND_TASK_DOMAINS.length).toBeGreaterThan(0)
    expect(TASK_DOMAINS).toEqual(BACKEND_TASK_DOMAINS)
    for (const [i, value] of BACKEND_TASK_DOMAINS.entries()) {
      expect(TASK_DOMAINS[i]).toBe(value)
    }
  })

  it('两个 zod schema 直接消费同一数组（不是第二份字面量）', () => {
    expect(taskViewResponseSchema.shape.status.options).toEqual([...BACKEND_TASK_STATUSES])
    expect(taskViewResponseSchema.shape.domain.options).toEqual([...BACKEND_TASK_DOMAINS])
    expect(taskSubmitResponseSchema.shape.status.options).toEqual([...BACKEND_TASK_STATUSES])
  })
})
