// @vitest-environment jsdom
/**
 * 首屏档（c2，2026-11-03）：进页面落在钦州港，而不是北部湾全域。
 *
 * 判据分两层，缺一层都会退化成「只改了一个渲染器」：
 * ① 值：PORT 档存在、比 REGION 近一个量级；
 * ② 接线：两个渲染器都必须从 VIEW_LEVELS.PORT 取初始视图（只改 3D 会让 2D 页停在 zoom 9）。
 *
 * 失效条件：若将来把「首屏落下」改由业务页各自 flyTo 决定，本条应改为断言那个入口，
 * 而不是继续钉渲染器初始化。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { MAP_CONFIG } from '../map'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(here, '../../..')

function readRenderer(name: string): string {
  return readFileSync(join(srcRoot, 'core/map/renderers', name), 'utf8')
}

describe('地图首屏档（PORT = 钦州港）', () => {
  it('PORT 档存在，且比全域档近一个量级以上', () => {
    const port = MAP_CONFIG.VIEW_LEVELS.PORT
    const region = MAP_CONFIG.VIEW_LEVELS.REGION
    expect(port.height).toBeLessThan(region.height / 10)
    expect(port.zoom).toBeGreaterThan(region.zoom)
    expect(port.center).toEqual({ lng: 108.590379, lat: 21.726917 })
  })

  it('2D 与 3D 两个渲染器都从 PORT 档取初始视图（只改一侧即红）', () => {
    expect(readRenderer('OLRenderer.ts')).toContain('VIEW_LEVELS.PORT.zoom')
    expect(readRenderer('CesiumRenderer.ts')).toContain('VIEW_LEVELS.PORT')
  })
})
