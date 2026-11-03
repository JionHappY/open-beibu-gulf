import { describe, expect, it } from 'vitest'
import { businessNavItems, navItems, registerNavItems, type NavItem } from '../navConfig'

function item(path: string, type: NavItem['type']): NavItem {
  return { path, label: path, type }
}

describe('navConfig 派生业务项', () => {
  it('businessNavItems 只留 type=business，并保持注册顺序', () => {
    registerNavItems([
      item('/', 'home'),
      item('/site-suitability', 'business'),
      item('/flood-analysis', 'business'),
      item('/profile', 'profile'),
    ])
    expect(businessNavItems.value.map((i) => i.path)).toEqual([
      '/site-suitability',
      '/flood-analysis',
    ])
  })

  it('重新注册后派生列表跟随，且 navItems 仍是全量', () => {
    registerNavItems([item('/', 'home'), item('/forecast', 'business')])
    expect(businessNavItems.value.map((i) => i.path)).toEqual(['/forecast'])
    expect(navItems.value).toHaveLength(2)

    registerNavItems([item('/', 'home'), item('/profile', 'profile')])
    expect(businessNavItems.value).toEqual([])
    expect(navItems.value.map((i) => i.type)).toEqual(['home', 'profile'])
  })
})
