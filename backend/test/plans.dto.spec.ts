import { describe, expect, it } from 'vitest'

import { BusinessError, ErrorCode } from '../src/common/errors/business-error'
import { PlanCreateBody, PlanUpdateBody } from '../src/modules/plans/dto/plans.dto'

// 方案名白名单校验：文案与 Express plansController 逐字节对齐（差异即缺陷）
function expectBiz(fn: () => unknown, message: string): void {
  try {
    fn()
    expect.unreachable('应抛出 BusinessError')
  } catch (err) {
    expect(err).toBeInstanceOf(BusinessError)
    const biz = err as BusinessError
    expect(biz.bizCode).toBe(ErrorCode.INVALID_PARAMS.code)
    expect(biz.message).toBe(message)
    expect(biz.status).toBe(400)
  }
}

const NAME_MSG = '方案名称只能包含中文、字母、数字、下划线、连字符和空格，且长度不超过 50 字符'
const SELECTED_KEYS_MSG = 'selectedKeys 必须是字符串数组'
const TYPE_SETTINGS_MSG = 'typeSettings 必须是对象，且每个键的值必须是对象'

describe('PlanCreateBody.parse 方案名规则（后端为唯一权威）', () => {
  it('缺 name/selectedKeys → 400001 缺少必要字段', () => {
    expectBiz(() => PlanCreateBody.parse({}), '缺少必要字段: name, selectedKeys')
    expectBiz(() => PlanCreateBody.parse({ name: '方案A' }), '缺少必要字段: name, selectedKeys')
  })

  it('名称非法字符 → 400001 方案名文案', () => {
    // 09-11 双轨消除：此前该正则在 PlanSaveModal.vue 另有一份副本，现只保留后端这一份。
    // 含 `!`/`/`/`:`/emoji 等一律拒绝。
    for (const name of ['方案!', 'a/b', 'a:b', '方案😀', '<script>']) {
      expectBiz(() => PlanCreateBody.parse({ name, selectedKeys: ['a'] }), NAME_MSG)
    }
  })

  it('名称为空串 → 400001 缺少必要字段（`!name` 先于正则命中，与 Express 同序）', () => {
    expectBiz(
      () => PlanCreateBody.parse({ name: '', selectedKeys: ['a'] }),
      '缺少必要字段: name, selectedKeys'
    )
  })

  it('名称超长（>50）→ 400001 方案名文案；恰好 50 放行', () => {
    expectBiz(() => PlanCreateBody.parse({ name: 'x'.repeat(51), selectedKeys: ['a'] }), NAME_MSG)
    const dto = PlanCreateBody.parse({ name: 'x'.repeat(50), selectedKeys: ['a'] })
    expect(dto.name).toBe('x'.repeat(50))
  })

  it('合法名称边界 → 中文/空格/连字符/下划线均放行', () => {
    for (const name of ['方案A', 'my plan', 'a-b', 'a_b', '钦州湾 方案-1']) {
      const dto = PlanCreateBody.parse({ name, selectedKeys: ['hospital'] })
      expect(dto.name).toBe(name)
    }
  })

  it('合法入参 → 白名单字段保留，缺省字段归零', () => {
    const dto = PlanCreateBody.parse({ name: '方案A', selectedKeys: ['hospital'] })
    expect(dto.name).toBe('方案A')
    expect(dto.selectedKeys).toEqual(['hospital'])
    expect(dto.typeSettings).toEqual({})
    expect(dto.weights).toBeNull()
  })
})

// d148：读侧 planSchema 要求 selectedKeys 是 string[]、typeSettings 是「键 → 对象」，
// 写侧原先只判真值 ⇒ 畸形 body 能落库，此后整批 GET /plans 被 zod 拒绝。
describe('PlanCreateBody.parse 两个 JSONB 字段的写入边界校验（d148）', () => {
  it('selectedKeys 非数组 / 含非字符串 → 400001，不落库', () => {
    for (const selectedKeys of ['abc', { a: 1 }, ['a', 1], [null], [['a']]]) {
      expectBiz(() => PlanCreateBody.parse({ name: '方案A', selectedKeys }), SELECTED_KEYS_MSG)
    }
    // 假值仍走原有「缺少必要字段」口径（顺序不变，文案不漂移）
    expectBiz(
      () => PlanCreateBody.parse({ name: '方案A', selectedKeys: 0 }),
      '缺少必要字段: name, selectedKeys'
    )
  })

  it('typeSettings 自身非对象 → 400001（含旧实现静默收成 {} 的 0/空串）', () => {
    for (const typeSettings of ['abc', 0, false, [], ['hospital']]) {
      expectBiz(
        () => PlanCreateBody.parse({ name: '方案A', selectedKeys: ['a'], typeSettings }),
        TYPE_SETTINGS_MSG
      )
    }
  })

  it('typeSettings 的值为非对象 → 400001（读侧按 TypeSetting 结构消费）', () => {
    for (const value of ['x', 3000, true, null, ['x']]) {
      expectBiz(
        () =>
          PlanCreateBody.parse({
            name: '方案A',
            selectedKeys: ['a'],
            typeSettings: { hospital: value },
          }),
        TYPE_SETTINGS_MSG
      )
    }
  })

  it('合法值通过（阳性对照）：字符串数组 + 键 → 对象映射', () => {
    const typeSettings = { hospital: { selected: true, importance: 5, defaultRadius: 3000 } }
    const dto = PlanCreateBody.parse({
      name: '方案A',
      selectedKeys: ['hospital', 'park'],
      typeSettings,
    })
    expect(dto.selectedKeys).toEqual(['hospital', 'park'])
    expect(dto.typeSettings).toEqual(typeSettings)
    // 空数组是合法值（方案可以一个设施都不选），不是缺字段
    expect(PlanCreateBody.parse({ name: '方案B', selectedKeys: [] }).selectedKeys).toEqual([])
  })
})

describe('PlanUpdateBody.parse 方案名规则（与 create 同口径，堵住改名绕口）', () => {
  it('改名时名称非法 → 400001 方案名文案（不因 update 而放宽）', () => {
    expectBiz(() => PlanUpdateBody.parse({ name: '方案!' }), NAME_MSG)
    expectBiz(() => PlanUpdateBody.parse({ name: 'x'.repeat(51) }), NAME_MSG)
  })

  it('未传 name → 不触发名称校验（部分更新语义）', () => {
    const updates = PlanUpdateBody.parse({ selectedKeys: ['a'] })
    expect('name' in updates).toBe(false)
    expect(updates.selectedKeys).toEqual(['a'])
  })

  it('合法改名 → 仅透传白名单四字段', () => {
    const updates = PlanUpdateBody.parse({
      name: '新方案',
      selectedKeys: ['a'],
      typeSettings: { r: { selected: false } },
      weights: { a: 1 },
      hacked: true,
    })
    expect(Object.keys(updates).sort()).toEqual(['name', 'selectedKeys', 'typeSettings', 'weights'])
  })

  // 局部更新只校验「真传了」的字段；畸形值同样在写入口拒绝，不落库
  it('updated 的两个 JSONB 字段畸形 → 400001', () => {
    expectBiz(() => PlanUpdateBody.parse({ selectedKeys: 'abc' }), SELECTED_KEYS_MSG)
    expectBiz(() => PlanUpdateBody.parse({ selectedKeys: ['a', 1] }), SELECTED_KEYS_MSG)
    expectBiz(() => PlanUpdateBody.parse({ typeSettings: 'abc' }), TYPE_SETTINGS_MSG)
    expectBiz(() => PlanUpdateBody.parse({ typeSettings: { r: 1 } }), TYPE_SETTINGS_MSG)
  })
})
