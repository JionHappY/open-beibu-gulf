import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SliderSelectCard from '../SliderSelectCard.vue'

function mountCard(props: Record<string, unknown> = {}) {
  return mount(SliderSelectCard, {
    props: { selecting: false, selected: false, label: '准则一', ...props },
  })
}

describe('SliderSelectCard', () => {
  it('默认态是按钮：色点 + 名称，点击只发 toggle', async () => {
    const wrapper = mountCard({ dotColor: 'rgb(1 2 3)' })

    // 组件有两支根节点（选择态 div / 其余态 button），wrapper.element 是片段锚点，按选择器取按钮
    expect(wrapper.find('button.ssc').exists()).toBe(true)
    expect(wrapper.find('.ssc-dot').text()).toBe('●')
    expect(wrapper.find('.ssc-label').text()).toBe('准则一')
    expect(wrapper.find('input[type="range"]').exists()).toBe(false)

    await wrapper.find('button.ssc').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('update:sliderValue')).toBeUndefined()
  })

  it('已选态多一行状态文案，仍可点击切换', async () => {
    const wrapper = mountCard({ selected: true, statusText: '一般重要' })

    expect(wrapper.find('button.ssc').classes()).toContain('confirmed')
    expect(wrapper.find('.ssc-status').text()).toBe('一般重要')

    await wrapper.find('button.ssc').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('已选但无状态文案时不渲染状态行（不出现空行占位）', () => {
    const wrapper = mountCard({ selected: true })
    expect(wrapper.find('.ssc-status').exists()).toBe(false)
  })

  it('选择态渲染滑块，并把输入值以数字抛给父级', async () => {
    const wrapper = mountCard({ selecting: true, sliderValue: 3, sliderMin: 1, sliderMax: 5 })
    const slider = wrapper.find('input[type="range"]')

    expect(slider.exists()).toBe(true)
    expect((slider.element as HTMLInputElement).value).toBe('3')

    await slider.setValue('4')
    expect(wrapper.emitted('update:sliderValue')).toEqual([[4]])
  })

  it('选择态但 sliderValue 为 null：不渲染滑块，显示占位文案', () => {
    const wrapper = mountCard({ selecting: true, sliderValue: null, sliderPlaceholder: '模型基线' })

    expect(wrapper.find('input[type="range"]').exists()).toBe(false)
    expect(wrapper.find('.ssc-placeholder').text()).toBe('模型基线')
  })

  it('选择态带状态文案时显示状态行（滑块旁仍可看到当前档位含义）', () => {
    const wrapper = mountCard({ selecting: true, sliderValue: 3, statusText: '一般重要' })

    expect(wrapper.find('input[type="range"]').exists()).toBe(true)
    expect(wrapper.find('.ssc-status').text()).toBe('一般重要')
  })

  it('选择态点击不冒泡成 toggle（避免调参时误触收起）', async () => {
    const wrapper = mountCard({ selecting: true, sliderValue: 3 })

    await wrapper.trigger('click')
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('#icon 插槽存在时不再渲染色点', () => {
    const wrapper = mount(SliderSelectCard, {
      props: { selecting: false, selected: false, label: '准则一', dotColor: 'rgb(1 2 3)' },
      slots: { icon: '<i class="my-icon" />' },
    })

    expect(wrapper.find('.my-icon').exists()).toBe(true)
    expect(wrapper.find('.ssc-dot').exists()).toBe(false)
  })

  it('badge 在三种态都渲染（如「（模拟）」）', () => {
    for (const props of [{}, { selected: true }, { selecting: true, sliderValue: 2 }]) {
      const wrapper = mountCard({ ...props, badge: '（模拟）' })
      expect(wrapper.find('.ssc-badge').text()).toBe('（模拟）')
    }
  })
})
