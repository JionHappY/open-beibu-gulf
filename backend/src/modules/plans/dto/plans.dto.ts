import { ApiProperty } from '@nestjs/swagger'

import { BusinessError, ErrorCode } from '../../../common/errors/business-error'
import { asRecord } from '../../../common/utils/as-record'

// 方案名称正则（对齐 Express plansController：中文/字母/数字/下划线/连字符/空格，1-50）
export const PLAN_NAME_REGEX = /^[\u4e00-\u9fa5a-zA-Z0-9_\-\s]{1,50}$/

const PLAN_NAME_MESSAGE =
  '方案名称只能包含中文、字母、数字、下划线、连字符和空格，且长度不超过 50 字符'

// 两个 JSONB 字段的写入口类型校验（d148）：读侧 planSchema 对 selectedKeys 是
// z.array(z.string())，写侧原先只判真值 ⇒ 非 UI 客户端传 `"abc"` 也能落库，此后
// GET /plans 整批被 zod 拒绝，列表打不开也就删不掉那条坏数据（自伤型可用性）。
// 口径与前端写入侧 parseTypeSettingsForWrite 对齐：typeSettings 为「键 → 对象」映射。
const SELECTED_KEYS_MESSAGE = 'selectedKeys 必须是字符串数组'
const TYPE_SETTINGS_MESSAGE = 'typeSettings 必须是对象，且每个键的值必须是对象'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertSelectedKeys(value: unknown): void {
  if (!Array.isArray(value) || !value.every((key) => typeof key === 'string')) {
    throw new BusinessError(ErrorCode.INVALID_PARAMS, SELECTED_KEYS_MESSAGE)
  }
}

function assertTypeSettings(value: unknown): void {
  if (!isRecord(value) || !Object.values(value).every(isRecord)) {
    throw new BusinessError(ErrorCode.INVALID_PARAMS, TYPE_SETTINGS_MESSAGE)
  }
}

export class PlanCreateBody {
  @ApiProperty({ description: '方案名（1-50，中文/字母/数字/下划线/连字符/空格）' })
  name!: string

  @ApiProperty({ description: '选中的设施类型键列表' })
  selectedKeys!: unknown

  typeSettings!: unknown
  weights!: unknown

  // 校验顺序与文案逐字节对齐 Express createOne
  static parse(raw: unknown): PlanCreateBody {
    const body = asRecord(raw)
    const { name, selectedKeys, typeSettings, weights } = body
    if (!name || !selectedKeys) {
      throw new BusinessError(ErrorCode.INVALID_PARAMS, '缺少必要字段: name, selectedKeys')
    }
    if (typeof name !== 'string' || !PLAN_NAME_REGEX.test(name)) {
      throw new BusinessError(ErrorCode.INVALID_PARAMS, PLAN_NAME_MESSAGE)
    }
    assertSelectedKeys(selectedKeys)
    const dto = new PlanCreateBody()
    dto.name = name
    dto.selectedKeys = selectedKeys
    // 缺省落 {}（原 `|| {}` 会把 0/''/false 静默收成 {}，与「非法即拒绝」相反）
    if (typeSettings === undefined || typeSettings === null) {
      dto.typeSettings = {}
    } else {
      assertTypeSettings(typeSettings)
      dto.typeSettings = typeSettings
    }
    dto.weights = weights || null
    return dto
  }
}

export class PlanUpdateBody {
  name?: unknown
  selectedKeys?: unknown
  typeSettings?: unknown
  weights?: unknown

  // 对齐 Express updateOne：部分更新，只挑四字段透传；
  // name 正则与 create 同口径校验（update 放行会在改名时写入 create 阶段
  // 拒绝的非法名称，形成校验绕口——Express 现行为为历史缺口，此处补齐）。
  // 返回普通对象而非类实例：ES2022 define-fields 下类声明字段会以 undefined 进入
  // 自有属性集，repo 的 `key in updates` 判定会把未传字段当"显式传 undefined"覆盖掉
  static parse(raw: unknown): Record<string, unknown> {
    const body = asRecord(raw)
    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !PLAN_NAME_REGEX.test(body.name)) {
        throw new BusinessError(ErrorCode.INVALID_PARAMS, PLAN_NAME_MESSAGE)
      }
      updates.name = body.name
    }
    if (body.selectedKeys !== undefined) {
      assertSelectedKeys(body.selectedKeys)
      updates.selectedKeys = body.selectedKeys
    }
    if (body.typeSettings !== undefined) {
      assertTypeSettings(body.typeSettings)
      updates.typeSettings = body.typeSettings
    }
    if (body.weights !== undefined) updates.weights = body.weights
    return updates
  }
}

export class PlanXiaoquBody {
  xiaoqu!: Record<string, unknown>

  // 对齐 Express saveXiaoquToOne：xiaoqu 对象整体透传（含 id 必填）
  static parse(raw: unknown): PlanXiaoquBody {
    const body = asRecord(raw)
    const xiaoqu = body.xiaoqu
    if (!xiaoqu || typeof xiaoqu !== 'object' || !(xiaoqu as Record<string, unknown>).id) {
      throw new BusinessError(ErrorCode.INVALID_PARAMS, '缺少小区信息')
    }
    const dto = new PlanXiaoquBody()
    dto.xiaoqu = xiaoqu as Record<string, unknown>
    return dto
  }
}
