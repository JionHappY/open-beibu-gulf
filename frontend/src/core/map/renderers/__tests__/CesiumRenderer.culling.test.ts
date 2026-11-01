/**
 * CesiumRenderer 视口裁剪：重新显示必须按当前视口刷新（a095）。
 *
 * 失效形态：隐藏期间 `camera.changed` 的增量刷新被 updateCulledLayer 首段按 visible 早退，
 * 视口若在这期间移动过，重新显示拿到的是隐藏前的切片（整层空白/错位）。
 * 断言只观测公开协作面：`viewer.entities` 的实体集合 + `scene.requestRender` 的调用时切片。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

// getViewportBBox 的兜底路径要做真实角度换算：链式 mock 会让 bbox 恒为 0，
// 视口切换就退化成"处处可见"，本测试的存在意义随之消失。
vi.mock('cesium', async () => {
  const { makeCesiumMock } = await import('./cesiumMock')
  return makeCesiumMock({
    Math: {
      toRadians: (deg: number) => (deg * Math.PI) / 180,
      fromRadians: (rad: number) => (rad * 180) / Math.PI,
      toDegrees: (rad: number) => (rad * 180) / Math.PI,
    },
  })
})

import { CesiumRenderer } from '../CesiumRenderer'

const QINZHOU = { lng: 108.62, lat: 21.858 }
const FANGCHENG = { lng: 108.35, lat: 21.62 }

type Anchor = { lng: number; lat: number }

/** 以锚点为中心、±0.05° 的视口矩形（弧度制，computeViewRectangle 口径） */
function rectAround(anchor: Anchor) {
  const d = 0.05
  return {
    west: ((anchor.lng - d) * Math.PI) / 180,
    east: ((anchor.lng + d) * Math.PI) / 180,
    south: ((anchor.lat - d) * Math.PI) / 180,
    north: ((anchor.lat + d) * Math.PI) / 180,
  }
}

/** 锚点附近 ±0.01° 的 n 个点（保证落在 rectAround 的视口内） */
function pointsAround(anchor: Anchor, n: number, prefix: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    lng: anchor.lng + (i - n / 2) * 0.002,
    lat: anchor.lat + (i - n / 2) * 0.002,
    name: `${prefix}-point-${i}`,
  }))
}

/** 记录监听器的 Cesium 事件替身 */
function makeEvent() {
  const handlers = new Set<() => void>()
  return {
    addEventListener: vi.fn((fn: () => void) => handlers.add(fn)),
    removeEventListener: vi.fn((fn: () => void) => handlers.delete(fn)),
    fire: () => handlers.forEach((fn) => fn()),
    handlers,
  }
}

/** rAF 队列：相机监听走 rAF 防抖，测试需要确定性地"跑一帧" */
const rafQueue: FrameRequestCallback[] = []
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  rafQueue.push(cb)
  return rafQueue.length
})
vi.stubGlobal('cancelAnimationFrame', (id: number) => {
  rafQueue[id - 1] = () => {}
})

function flushRaf(): void {
  rafQueue.splice(0).forEach((cb) => cb(0))
}

function makeRenderer() {
  const container = { appendChild: vi.fn(), removeChild: vi.fn() } as unknown as HTMLElement
  const renderer = new CesiumRenderer(container)
  const changed = makeEvent()
  const view = { rect: rectAround(QINZHOU) }
  /** viewer.entities 集合（与渲染器自己的 instance 数组是两个对象，同真实 EntityCollection） */
  const values: Array<{ id: string; show?: boolean }> = []
  /** requestRender 被调用那一刻的实体 id 快照：用于钉「先刷新、后请求渲染」的顺序 */
  const renderedAtRequest: string[][] = []
  const requestRender = vi.fn(() => {
    renderedAtRequest.push(values.map((e) => e.id).sort())
  })
  renderer.viewer = {
    isDestroyed: () => false,
    scene: {
      requestRender,
      globe: { ellipsoid: {} },
      primitives: { add: vi.fn(), remove: vi.fn() },
    },
    camera: {
      changed,
      moveStart: makeEvent(),
      moveEnd: makeEvent(),
      // height 10000m < 5e6：不触发"太高不裁剪"
      positionCartographic: { longitude: 0, latitude: 0, height: 10000 },
      computeViewRectangle: () => view.rect,
    },
    entities: {
      values,
      add: vi.fn((options: { id: string; show?: boolean }) => {
        const entity = { id: options.id, show: options.show ?? true }
        values.push(entity)
        return entity
      }),
      remove: vi.fn((entity: { id: string }) => {
        const idx = values.indexOf(entity)
        if (idx !== -1) values.splice(idx, 1)
      }),
      contains: (entity: unknown) => values.includes(entity as { id: string }),
    },
  } as never
  return { renderer, view, values, changed, requestRender, renderedAtRequest }
}

const idsOf = (values: Array<{ id: string }>) => values.map((e) => e.id)

describe('CesiumRenderer 视口裁剪重新显示（a095）', () => {
  afterEach(() => {
    rafQueue.length = 0
    vi.unstubAllGlobals()
  })

  it('隐藏 → 改视口 → 重新显示：换成新视口切片，且刷新后才请求渲染', () => {
    const { renderer, view, values, changed, requestRender, renderedAtRequest } = makeRenderer()
    renderer.addPointLayer(
      'culled',
      [...pointsAround(QINZHOU, 3, 'qz'), ...pointsAround(FANGCHENG, 2, 'fc')],
      {}
    )

    // 初始视口在钦州港：只挂视口内实体
    expect(idsOf(values).sort()).toEqual(['culled-qz-0-0', 'culled-qz-1-1', 'culled-qz-2-2'])

    // 隐藏：实体全部不显示
    renderer.setVisibility('culled', false)
    expect(values.every((e) => e.show === false)).toBe(true)

    // 隐藏期间移动视口 + 相机事件：刷新被跳过，实体集合仍是旧切片（bug 的前置条件）
    view.rect = rectAround(FANGCHENG)
    requestRender.mockClear()
    renderedAtRequest.length = 0
    changed.fire()
    flushRaf()
    expect(idsOf(values).sort()).toEqual(['culled-qz-0-0', 'culled-qz-1-1', 'culled-qz-2-2'])

    // 重新显示：复用既有增量刷新换成新切片（id 末位是全量 features 里的索引，fc 从 3 起），
    // 且 requestRender 看到的就是新切片
    renderer.setVisibility('culled', true)
    expect(idsOf(values).sort()).toEqual(['culled-fc-0-3', 'culled-fc-1-4'])
    expect(values.every((e) => e.show === true)).toBe(true)
    expect(requestRender).toHaveBeenCalledTimes(1)
    expect(renderedAtRequest[0]).toEqual(['culled-fc-0-3', 'culled-fc-1-4'])
  })

  it('视口未变时重新显示：实体集合原样保留（不误删、不重建）', () => {
    const { renderer, values } = makeRenderer()
    renderer.addPointLayer('same', pointsAround(QINZHOU, 3, 'same'), {})
    const before = values.slice()

    renderer.setVisibility('same', false)
    renderer.setVisibility('same', true)

    expect(values).toEqual(before)
    expect(values.every((e) => e.show === true)).toBe(true)
  })
})
