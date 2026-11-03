import { mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it } from 'vitest'

import TaskResultChip from '../TaskResultChip.vue'

// jsdom 没有 Pointer Capture：芯片在 pointerdown 里捕获指针，不补桩会直接抛错
beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.releasePointerCapture = () => {}
})

/**
 * 桌面档的结果投递（G4 之后的同族收口）：
 * - 未过阈值松手 = 点击 ⇒ toggle（原有「上图/撤下」语义不变）；
 * - 过了阈值松手 ⇒ dragend 带坐标，由父层判落点是否命中导航项。
 * 这两条必须一起钉住：只钉 dragend 会把「点一下上图」弄坏，只钉 toggle 会把投递弄丢。
 */
describe('TaskResultChip（拖出上图 / 拖到导航项）', () => {
  // jsdom 的 MouseEvent.clientX 只有 getter，VTU 的 trigger 传坐标会抛
  // 「Cannot set property clientX」⇒ 直接构造 MouseEvent 派发（pointer 事件的 init 与它同源）。
  function fire(el: Element, type: string, x: number, y: number): void {
    el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))
  }

  async function downUp(
    wrapper: ReturnType<typeof mount>,
    from: [number, number],
    to: [number, number]
  ): Promise<void> {
    const el = wrapper.find('.task-result-chip').element
    fire(el, 'pointerdown', from[0], from[1])
    if (to[0] !== from[0] || to[1] !== from[1]) fire(el, 'pointermove', to[0], to[1])
    fire(el, 'pointerup', to[0], to[1])
    await wrapper.vm.$nextTick()
  }

  it('原地点击 ⇒ 只发 toggle，不发 dragend', async () => {
    const wrapper = mount(TaskResultChip, { props: { label: '航线 A' } })
    await downUp(wrapper, [10, 10], [10, 10])
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('dragend')).toBeUndefined()
  })

  it('拖动 40px 松手 ⇒ 只发 dragend，且坐标是松手点（不再当点击上图）', async () => {
    const wrapper = mount(TaskResultChip, { props: { label: '航线 A' } })
    await downUp(wrapper, [10, 10], [50, 46])
    expect(wrapper.emitted('toggle')).toBeUndefined()
    expect(wrapper.emitted('dragend')?.[0]).toEqual([{ x: 50, y: 46 }])
  })

  it('拖 6px（未到 8px 阈值）仍按点击处理', async () => {
    const wrapper = mount(TaskResultChip, { props: { label: '航线 A' } })
    await downUp(wrapper, [10, 10], [16, 15])
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('dragend')).toBeUndefined()
  })
})
