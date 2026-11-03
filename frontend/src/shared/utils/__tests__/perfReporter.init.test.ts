/**
 * PerfReporter 启动/接线判据（与 perfReporter.test.ts 的聚合逻辑分开）
 * 覆盖 initPerfReporter 的接线契约：四类观察者注册、启动幂等、观察者不可用时降级、
 * FPS 采样的「>1s 暂停不计入」与长帧阈值、TTI 近似、window.__perf 挂载与 print 不抛。
 * 这些接线一旦漂移，埋点会静默失效（数字还在，只是永远是 0）——所以每条都盯行为。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ObserverCallback = (list: { getEntries: () => unknown[] }) => void

interface ObserverCall {
  type: string
  emit: (entries: unknown[]) => void
}

function installObservers(options: { throws?: boolean } = {}): ObserverCall[] {
  const calls: ObserverCall[] = []
  class FakePerformanceObserver {
    private readonly callback: ObserverCallback
    constructor(callback: ObserverCallback) {
      if (options.throws) throw new Error('PerformanceObserver unsupported')
      this.callback = callback
    }
    observe(init: { type: string }): void {
      calls.push({
        type: init.type,
        emit: (entries) => this.callback({ getEntries: () => entries }),
      })
    }
  }
  vi.stubGlobal('PerformanceObserver', FakePerformanceObserver)
  return calls
}

function installRaf(): FrameRequestCallback[] {
  const queue: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    queue.push(cb)
    return queue.length
  })
  return queue
}

async function boot(options: { throws?: boolean } = {}) {
  vi.resetModules()
  const calls = installObservers(options)
  const frames = installRaf()
  const mod = await import('../perfReporter')
  return { mod, calls, frames }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(performance, 'now').mockReturnValue(0)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete window.__perf
})

describe('initPerfReporter 接线', () => {
  it('注册四类观察者：paint / LCP / layout-shift / longtask', async () => {
    const { mod, calls } = await boot()
    mod.initPerfReporter()
    expect(calls.map((c) => c.type)).toEqual([
      'paint',
      'largest-contentful-paint',
      'layout-shift',
      'longtask',
    ])
  })

  it('启动幂等：重复调用不重复注册、不重复起采样循环', async () => {
    const { mod, calls, frames } = await boot()
    mod.initPerfReporter()
    mod.initPerfReporter()
    mod.initPerfReporter()
    expect(calls).toHaveLength(4)
    expect(frames).toHaveLength(1)
  })

  it('观察者不可用（构造即抛）时降级：不抛、仍挂 window.__perf 并起采样', async () => {
    const { mod, frames } = await boot({ throws: true })
    expect(() => mod.initPerfReporter()).not.toThrow()
    expect(frames).toHaveLength(1)
    expect(window.__perf?.print).toBeTypeOf('function')
  })

  it('FCP 只认 first-contentful-paint，其它 paint 条目不改 fcp', async () => {
    const { mod, calls } = await boot()
    mod.initPerfReporter()
    const paint = calls.find((c) => c.type === 'paint')
    paint?.emit([{ name: 'first-paint', startTime: 5 }])
    expect(mod._perfStateForTest().fcp).toBeUndefined()
    paint?.emit([{ name: 'first-contentful-paint', startTime: 12.5 }])
    expect(mod._perfStateForTest().fcp).toBe(12.5)
  })

  it('LCP 取批次最后一条；CLS 累加 value、缺 value 记 0；longtask 计数', async () => {
    const { mod, calls } = await boot()
    mod.initPerfReporter()
    calls
      .find((c) => c.type === 'largest-contentful-paint')
      ?.emit([{ startTime: 5 }, { startTime: 9 }])
    calls.find((c) => c.type === 'layout-shift')?.emit([{ value: 0.1 }, { value: 0.2 }, {}])
    calls.find((c) => c.type === 'longtask')?.emit([{}])
    calls.find((c) => c.type === 'longtask')?.emit([{}])

    const state = mod._perfStateForTest()
    expect(state.lcp).toBe(9)
    expect(state.cls).toBeCloseTo(0.3)
    expect(state.longtasks).toBe(2)
  })

  it('FPS 采样：>1s 的暂停不计入均值，>50ms 的帧计入长帧', async () => {
    const { mod, frames } = await boot()
    mod.initPerfReporter()
    // 第一帧 rAF 已入队，按时间推进驱动
    frames.shift()?.(16) // dt=16 → ~62.5fps
    frames.shift()?.(32) // dt=16
    frames.shift()?.(1600) // dt=1568 → 切 tab 造成的暂停，必须丢弃
    frames.shift()?.(1660) // dt=60 → 长帧

    const fps = mod._perfStateForTest().fps
    expect(fps.samples).toHaveLength(3)
    expect(fps.longFrames).toBe(1)
    expect(fps.min).toBeCloseTo(1000 / 60)
  })

  it('TTI 近似：load 事件后取 navigation.loadEventEnd', async () => {
    const { mod } = await boot()
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { loadEventEnd: 1234 },
    ] as unknown as PerformanceEntryList)
    mod.initPerfReporter()
    window.dispatchEvent(new Event('load'))
    expect(mod._perfStateForTest().tti).toBe(1234)
  })

  it('window.__perf 暴露的入口全部可调用，空态 print 不抛', async () => {
    const { mod } = await boot()
    mod.initPerfReporter()
    const api = window.__perf
    expect(api).toBeDefined()
    for (const key of ['mark', 'measure', 'time', 'recordCesium', 'recordApi', 'reportError']) {
      expect(typeof api?.[key as keyof typeof api]).toBe('function')
    }
    expect(api?.report()).toMatchObject({ fps: { avg: 0, min: 0, longFrames: 0 } })
    expect(() => api?.print()).not.toThrow()
  })
})
