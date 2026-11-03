import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { useWaitForRenderer } from '../useWaitForRenderer'

const STEP = 500

describe('useWaitForRenderer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('渲染器已就绪：立即执行，不留定时器', () => {
    const ready = vi.fn(() => true)
    const callback = vi.fn()

    useWaitForRenderer(ready, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(ready).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('渲染器晚到：按 500ms 间隔重试，就绪后只执行一次', () => {
    const ready = vi.fn<() => boolean>().mockReturnValueOnce(false).mockReturnValueOnce(false)
    ready.mockReturnValue(true)
    const callback = vi.fn()

    useWaitForRenderer(ready, callback)

    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(STEP)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(STEP)
    expect(callback).toHaveBeenCalledTimes(1)

    // 已就绪后不再续约定时器
    vi.advanceTimersByTime(STEP * 5)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('始终不就绪：最多重试 10 次即自停，不无限轮询', () => {
    const ready = vi.fn(() => false)
    const callback = vi.fn()

    useWaitForRenderer(ready, callback)
    vi.advanceTimersByTime(STEP * 30)

    // 首次调用 + 10 次重试 = 11 次探测，此后不再续约
    expect(ready).toHaveBeenCalledTimes(11)
    expect(callback).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('取消函数清掉在途定时器，组件卸载后不再探测', () => {
    const ready = vi.fn(() => false)
    const callback = vi.fn()

    const cancel = useWaitForRenderer(ready, callback)
    cancel()

    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(STEP * 30)
    expect(ready).toHaveBeenCalledTimes(1)
    expect(callback).not.toHaveBeenCalled()
  })

  it('没有在途定时器时调用取消不抛错（就绪后 / 重复取消）', () => {
    const callback = vi.fn()

    const cancel = useWaitForRenderer(() => true, callback)
    expect(callback).toHaveBeenCalledTimes(1)

    expect(() => cancel()).not.toThrow()
    expect(() => cancel()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('组件卸载自动取消，不悬挂定时器', async () => {
    const ready = vi.fn(() => false)
    const callback = vi.fn()

    const Probe = defineComponent({
      setup() {
        useWaitForRenderer(ready, callback)
        return () => h('div')
      },
    })

    const wrapper = mount(Probe)
    vi.advanceTimersByTime(STEP)
    expect(ready).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(STEP * 30)
    expect(ready).toHaveBeenCalledTimes(2)
    expect(callback).not.toHaveBeenCalled()
  })

  it('在 setup 之外调用（无活跃实例）不抛错，且仍有界自停', () => {
    const ready = vi.fn(() => false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => useWaitForRenderer(ready, () => {})).not.toThrow()
    vi.advanceTimersByTime(STEP * 30)

    expect(ready).toHaveBeenCalledTimes(11)
    // 没有活跃实例时不应出现 Vue 的「onUnmounted is called when there is no active
    // component instance」告警——本模块用 getCurrentInstance() 显式规避了它
    expect(warn.mock.calls.some((c) => String(c[0]).includes('onUnmounted'))).toBe(false)
  })
})
