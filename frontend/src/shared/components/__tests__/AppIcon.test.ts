import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppIcon from '../AppIcon.vue'
import { ICON_PATHS, isIconName } from '../icons'

describe('AppIcon（命名图标 → 内联 SVG）', () => {
  it('登记名渲染对应 path，颜色走 currentColor', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home' } })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.find('path').attributes('d')).toBe(ICON_PATHS.home)
    expect(wrapper.find('svg').attributes('stroke')).toBe('currentColor')
  })

  it('isIconName 只认已登记名（未点名字符保留字符通道）', () => {
    expect(isIconName('flood')).toBe(true)
    expect(isIconName('☀️')).toBe(false)
    expect(isIconName('')).toBe(false)
  })
})
