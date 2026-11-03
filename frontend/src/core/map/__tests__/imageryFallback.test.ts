import { beforeEach, describe, expect, it, vi } from 'vitest'

const warn = vi.fn()

vi.mock('@/shared', () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }))

import { createImageryErrorBinding } from '../imageryFallback'

interface FakeProvider {
  errorEvent: { addEventListener: (listener: (err: unknown) => void) => void }
  /** 挂上去的回调（顺序同 attach 顺序） */
  listeners: Array<(err: unknown) => void>
}

function provider(): FakeProvider {
  const listeners: Array<(err: unknown) => void> = []
  return {
    listeners,
    errorEvent: {
      addEventListener: (listener) => {
        listeners.push(listener)
      },
    },
  }
}

/** 取出 attach 时挂上去的回调 */
function listenerOf(p: FakeProvider): (err: unknown) => void {
  expect(p.listeners.length).toBeGreaterThan(0)
  return p.listeners[0]
}

describe('createImageryErrorBinding', () => {
  beforeEach(() => {
    warn.mockClear()
  })

  it('首个瓦片错误只回调一次，并把错误写进日志', () => {
    const onFirstError = vi.fn()
    const binding = createImageryErrorBinding({ onFirstError })
    const p = provider()
    binding.attach(p)

    listenerOf(p)(new Error('tile timeout'))

    expect(onFirstError).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('底图瓦片加载失败')
    expect(warn.mock.calls[0][1]).toBe('tile timeout')
  })

  it('后续错误不再回调（否则每块瓦片都会重设底色/标记）', () => {
    const onFirstError = vi.fn()
    const binding = createImageryErrorBinding({ onFirstError })
    const p = provider()
    binding.attach(p)

    const handler = listenerOf(p)
    handler(new Error('first'))
    handler(new Error('second'))
    handler(new Error('third'))

    expect(onFirstError).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('多个 provider 共享同一个去重状态', () => {
    const onFirstError = vi.fn()
    const binding = createImageryErrorBinding({ onFirstError })
    const a = provider()
    const b = provider()
    binding.attach(a)
    binding.attach(b)

    listenerOf(b)(new Error('from b'))
    listenerOf(a)(new Error('from a'))

    expect(onFirstError).toHaveBeenCalledTimes(1)
    expect(binding.providers).toEqual([a, b])
  })

  it('provider 缺失或没有 errorEvent 时静默跳过，不进记账表', () => {
    const binding = createImageryErrorBinding({ onFirstError: vi.fn() })

    expect(() => binding.attach(null as unknown as FakeProvider)).not.toThrow()
    expect(() => binding.attach({} as FakeProvider)).not.toThrow()
    expect(() => binding.attach({ errorEvent: null } as unknown as FakeProvider)).not.toThrow()

    expect(binding.providers).toHaveLength(0)
  })

  it('非 Error 的抛出值原样进日志（WebGL/Cesium 常抛字符串或对象）', () => {
    const binding = createImageryErrorBinding({ onFirstError: vi.fn() })
    const p = provider()
    binding.attach(p)

    const payload = { status: 404, url: 'https://t0.tianditu.gov.cn/x' }
    listenerOf(p)(payload)

    expect(warn.mock.calls[0][1]).toBe(payload)
  })

  it('handler 可由调用方自行持有并摘除（渲染器销毁路径依赖它保持同一引用）', () => {
    const onFirstError = vi.fn()
    const binding = createImageryErrorBinding({ onFirstError })
    const p = provider()
    binding.attach(p)

    const registered = listenerOf(p)
    expect(registered).toBe(binding.handler)

    binding.handler(new Error('manual'))
    expect(onFirstError).toHaveBeenCalledTimes(1)
  })
})
