import { describe, expect, it } from 'vitest'

import { acceptLateResponse } from '../lateResponse'

/**
 * 迟到响应闸的判据：三种「该不该写 store」的分叉。
 * 第三条（渲染器未就绪 ⇒ 放行）就是原先丢首屏结果的根因，必须能被变异打红。
 */
describe('acceptLateResponse', () => {
  it('引擎一致：放行', () => {
    expect(acceptLateResponse({ actualEngine: '3d', expectedEngine: '3d', unmounted: false })).toBe(
      true
    )
  })

  it('引擎不一致：丢弃（防把 3D 页图层画到 2D 页）', () => {
    expect(acceptLateResponse({ actualEngine: '2d', expectedEngine: '3d', unmounted: false })).toBe(
      false
    )
    expect(acceptLateResponse({ actualEngine: '3d', expectedEngine: '2d', unmounted: false })).toBe(
      false
    )
  })

  it('渲染器尚未就绪：放行写 store 与登记图层，视觉由 reapplyAll 补建', () => {
    expect(acceptLateResponse({ actualEngine: null, expectedEngine: '3d', unmounted: false })).toBe(
      true
    )
  })

  it('页面已卸载：即便引擎一致也丢弃（防离开后图层复活）', () => {
    expect(acceptLateResponse({ actualEngine: '3d', expectedEngine: '3d', unmounted: true })).toBe(
      false
    )
    expect(acceptLateResponse({ actualEngine: null, expectedEngine: '3d', unmounted: true })).toBe(
      false
    )
  })
})
