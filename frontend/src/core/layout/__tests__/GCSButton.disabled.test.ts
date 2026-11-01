import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared')>()
  const { ref } = await import('vue')
  return {
    ...actual,
    useGCS: () => ({ cell: () => ({}), cellPixel: ref(80) }),
  }
})

import GCSButton from '../components/GCSButton.vue'

describe('GCSButton 禁用态', () => {
  it('使用 disabled 文字与容器底，不再叠 opacity', () => {
    const wrapper = mount(GCSButton, { props: { disabled: true, label: '禁用' } })
    const style = wrapper.get('button').element.style
    expect(style.color).toBe('var(--GCS-text-disabled)')
    expect(style.backgroundColor).toBe('var(--GCS-bg-container)')
    expect(style.boxShadow).toBe('none')
    expect(style.opacity).toBe('')
  })

  it('非禁用态保持原文字与面板底色（阳性对照）', () => {
    const wrapper = mount(GCSButton, { props: { label: '可用' } })
    const style = wrapper.get('button').element.style
    expect(style.color).toBe('var(--GCS-text-regular)')
    expect(style.backgroundColor).toBe('var(--GCS-bg-panel)')
  })
})
