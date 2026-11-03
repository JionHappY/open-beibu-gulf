import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import { type NavItem, registerNavItems } from '../../navConfig'
import HomeAnalysisGrid from '../HomeAnalysisGrid.vue'

const BUSINESS: NavItem[] = [
  { type: 'business', label: '选址分析', icon: 'site-suitability', path: '/site-suitability' },
  { type: 'business', label: '浸没分析', icon: 'flood', path: '/flood-analysis' },
  { type: 'business', label: '预测分析', icon: 'forecast', path: '/forecast' },
]

function register(items: NavItem[] = BUSINESS) {
  registerNavItems([
    { type: 'home', label: '首页', icon: 'home', path: '/' },
    ...items,
    { type: 'profile', label: '个人中心', icon: 'profile', path: '/profile' },
  ])
}

describe('HomeAnalysisGrid', () => {
  beforeEach(() => {
    push.mockClear()
    register()
  })

  it('只渲染业务项，顺序与注册一致（首页/个人中心不进格子）', () => {
    const wrapper = mount(HomeAnalysisGrid)
    const labels = wrapper.findAll('.home-analysis__label').map((n) => n.text())

    expect(labels).toEqual(['选址分析', '浸没分析', '预测分析'])
  })

  it('每张卡带标签与一句说明，点击把路由交给 router', async () => {
    const wrapper = mount(HomeAnalysisGrid)
    const cards = wrapper.findAll('button.home-analysis__item')
    expect(cards).toHaveLength(3)

    await cards[0].trigger('click')
    expect(push).toHaveBeenCalledWith('/site-suitability')
  })

  it('说明文案按路径取；未登记的路径不留 undefined 字样', () => {
    register([...BUSINESS, { type: 'business', label: '新分析', path: '/brand-new' }])
    const wrapper = mount(HomeAnalysisGrid)

    const descs = wrapper.findAll('.home-analysis__desc').map((n) => n.text())
    expect(descs[0]).toContain('AHP')
    expect(descs[3]).toBe('')
  })

  it('disabled 项渲染为禁用按钮（占位不跳转）', () => {
    register([...BUSINESS, { type: 'business', label: '未上线', path: '/soon', disabled: true }])
    const wrapper = mount(HomeAnalysisGrid)

    const buttons = wrapper.findAll('button.home-analysis__item')
    const last = buttons[buttons.length - 1]
    expect(last.attributes('disabled')).toBeDefined()
  })

  it('图标名不在词表内时不渲染 AppIcon（isIconName 守卫）', () => {
    register([{ type: 'business', label: '未知图标', icon: 'not-an-icon', path: '/x' }])
    const wrapper = mount(HomeAnalysisGrid)

    expect(wrapper.findAllComponents({ name: 'AppIcon' })).toHaveLength(0)
  })

  it('图标名合法时渲染 AppIcon 并传 name', () => {
    register([{ type: 'business', label: '预测分析', icon: 'forecast', path: '/forecast' }])
    const wrapper = mount(HomeAnalysisGrid)

    const icons = wrapper.findAllComponents({ name: 'AppIcon' })
    expect(icons).toHaveLength(1)
    expect(icons[0].props('name')).toBe('forecast')
  })

  it('重新注册后格子跟随（派生自 navItems，不缓存首帧）', async () => {
    const wrapper = mount(HomeAnalysisGrid)
    expect(wrapper.findAll('button.home-analysis__item')).toHaveLength(3)

    register([{ type: 'business', label: '只剩一个', icon: 'forecast', path: '/forecast' }])
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('button.home-analysis__item')).toHaveLength(1)
    expect(wrapper.find('.home-analysis__label').text()).toBe('只剩一个')
  })
})
