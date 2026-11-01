/**
 * 收藏类型跨端对照（改任一侧必红）。
 *
 * 权威源 = 后端 `FAVORITE_ITEM_TYPES`（favorites.dto.ts）。
 * 前端在 `types/schemas.ts` 保留一份 zod 所需的运行期副本（L0 层不得运行时引后端）；
 * 本测试直接 import 两侧数组逐项比对，断言「副本 == 权威」。
 *
 * 失效条件：后端数组改名/换导出位置 ⇒ 本测试 import 失败（仍红，属预期）；
 * 前端改用生成物派生 ⇒ 判据面应改为比对生成物，本条作废。
 */
import { describe, expect, it } from 'vitest'

import { FAVORITE_ITEM_TYPES as BACKEND_ITEM_TYPES } from '@backend/modules/favorites/dto/favorites.dto'

import { FAVORITE_ITEM_TYPES, favoriteItemSchema } from '../schemas'

describe('收藏对象类型单源', () => {
  it('🔴 @guard-red-sample 前端数组与后端权威数组逐项相等', () => {
    expect(BACKEND_ITEM_TYPES.length).toBeGreaterThan(0)
    expect(FAVORITE_ITEM_TYPES).toEqual(BACKEND_ITEM_TYPES)
    // 逐项断言：顺序也参与（zod enum 会按顺序展示），且能在差异时报出具体项
    for (const [i, value] of BACKEND_ITEM_TYPES.entries()) {
      expect(FAVORITE_ITEM_TYPES[i]).toBe(value)
    }
  })

  it('zod enum 直接消费同一数组（不是第二份字面量）', () => {
    expect(favoriteItemSchema.shape.itemType.options).toEqual([...BACKEND_ITEM_TYPES])
  })
})
