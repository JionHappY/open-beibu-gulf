import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { gcsToastState, showToast } from '@/shared/utils/gcsFeedback'

import GCSToast from '../GCSToast.vue'

const DURATION = 3000

function mountToast() {
  return mount(GCSToast, { attachTo: document.body })
}

async function flush() {
  await nextTick()
  await nextTick()
}

describe('GCSToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    gcsToastState.items = []
  })

  afterEach(() => {
    vi.useRealTimers()
    gcsToastState.items = []
  })

  it('新 toast 渲染 3 秒后自动消失', async () => {
    const wrapper = mountToast()
    showToast('已收藏', 'success')
    await flush()

    expect(wrapper.findAll('.GCS-toast')).toHaveLength(1)
    expect(wrapper.find('.GCS-toast-message').text()).toBe('已收藏')

    vi.advanceTimersByTime(DURATION - 1)
    await flush()
    expect(wrapper.findAll('.GCS-toast')).toHaveLength(1)

    vi.advanceTimersByTime(1)
    await flush()
    expect(wrapper.findAll('.GCS-toast')).toHaveLength(0)
    wrapper.unmount()
  })

  it('队列满时挤掉最老的一条，新的一条仍有自己的计时器', async () => {
    const wrapper = mountToast()
    for (let i = 1; i <= 4; i++) showToast(`第 ${i} 条`)
    await flush()
    expect(wrapper.findAll('.GCS-toast')).toHaveLength(4)

    // 第 5 条：pop 最老 + unshift 新的，长度仍是 4——按「长度」侦听的实现这一刻不会触发，
    // 新 toast 将永远没有定时器（3 秒后不会消失）
    showToast('第 5 条')
    await flush()
    expect(wrapper.findAll('.GCS-toast')).toHaveLength(4)
    expect(wrapper.find('.GCS-toast-message').text()).toBe('第 5 条')
    expect(vi.getTimerCount()).toBe(4)

    vi.advanceTimersByTime(DURATION)
    await flush()
    expect(wrapper.findAll('.GCS-toast')).toHaveLength(0)
    wrapper.unmount()
  })

  it('被挤出的 toast 定时器同步清掉，不残留', async () => {
    const wrapper = mountToast()
    for (let i = 1; i <= 4; i++) showToast(`第 ${i} 条`)
    await flush()
    expect(vi.getTimerCount()).toBe(4)

    showToast('第 5 条')
    await flush()

    // 被 pop 掉的那条若不清定时器，这里会是 5
    expect(vi.getTimerCount()).toBe(4)
    wrapper.unmount()
  })

  it('组件卸载清空全部定时器，之后不再动队列', async () => {
    const wrapper = mountToast()
    for (let i = 1; i <= 4; i++) showToast(`第 ${i} 条`)
    await flush()

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)

    // 定时器已被取消：即使时间走到，队列也不应由已卸载组件改写
    vi.advanceTimersByTime(DURATION * 2)
    expect(gcsToastState.items).toHaveLength(4)
  })

  it('队列被外部清空后，残留定时器触发不报错也不误删别人', async () => {
    const wrapper = mountToast()
    showToast('会被外部清掉')
    await flush()

    // 外部（如登出清理）直接清空队列，组件侧仍有一个在飞的定时器
    gcsToastState.items = []
    showToast('后来的')
    await flush()

    await expect(async () => {
      vi.advanceTimersByTime(DURATION)
      await flush()
    }).not.toThrow()
    expect(wrapper.findAll('.GCS-toast')).toHaveLength(0)
    wrapper.unmount()
  })

  it('胶囊高度由 cell 派生（0.5 cell），文案与类型进对应的语义类', async () => {
    const wrapper = mountToast()
    showToast('服务异常', 'error')
    await flush()

    const toast = wrapper.find('.GCS-toast')
    expect(toast.classes()).toContain('GCS-toast--error')
    expect((toast.element as HTMLElement).style.height).toMatch(/^\d+(\.\d+)?px$/)
    expect(wrapper.find('.GCS-toast-dot').exists()).toBe(true)
    wrapper.unmount()
  })

  it('同一 tick 内连发多条时逐条独立计时', async () => {
    const wrapper = mountToast()
    showToast('第一条')
    showToast('第二条')
    await flush()
    expect(wrapper.findAll('.GCS-toast')).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(2)

    vi.advanceTimersByTime(DURATION)
    await flush()
    expect(wrapper.findAll('.GCS-toast')).toHaveLength(0)
    wrapper.unmount()
  })
})
