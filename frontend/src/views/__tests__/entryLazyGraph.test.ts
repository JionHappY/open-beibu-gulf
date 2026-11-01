import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const ENTRY = 'frontend/src/App.vue'

interface CruiseDependency {
  resolved?: string
  dynamic?: boolean
}

interface CruiseModule {
  source: string
  dependencies?: CruiseDependency[]
}

interface CruiseResult {
  modules: CruiseModule[]
}

function cruiseFromEntry(): CruiseResult {
  const pkg = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'node_modules/dependency-cruiser/package.json'), 'utf8')
  ) as { bin: string | Record<string, string> }
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['dependency-cruiser']
  const stdout = execFileSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules/dependency-cruiser', binRel),
      '-c',
      '.dependency-cruiser.cjs',
      '-T',
      'json',
      ENTRY,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  return JSON.parse(stdout.slice(stdout.indexOf('{'))) as CruiseResult
}

function staticReachable(result: CruiseResult, entry: string): Set<string> {
  const modules = new Map(result.modules.map((m) => [m.source, m]))
  const seen = new Set([entry])
  const queue = [entry]
  while (queue.length) {
    const current = queue.shift() as string
    for (const dep of modules.get(current)?.dependencies ?? []) {
      if (!dep.resolved || dep.dynamic || seen.has(dep.resolved)) continue
      seen.add(dep.resolved)
      queue.push(dep.resolved)
    }
  }
  return seen
}

describe('首屏入口图的懒加载边界', () => {
  const result = cruiseFromEntry()
  const staticSet = staticReachable(result, ENTRY)

  it('依赖图有效且入口静态侧仍含已知锚点', () => {
    expect(staticSet.size).toBeGreaterThan(0)
    expect(staticSet.has('frontend/src/business/manifest.ts')).toBe(true)
    expect(staticSet.has('frontend/src/core/map/UnifiedMap.vue')).toBe(true)
    expect(staticSet.has('frontend/src/core/layout/AppLayout.vue')).toBe(true)
  })

  it('入口静态侧不含 echarts、图表目录或页面组件', () => {
    const offenders = [...staticSet].filter(
      (src) =>
        /(^|\/)echarts(\/|$)/.test(src) ||
        /visualization\/charts\//.test(src) ||
        /Page\.vue$/.test(src)
    )
    expect(offenders).toEqual([])
  })

  it('五个业务模块入口仍是 manifest 的动态边', () => {
    const manifest = result.modules.find((m) => m.source === 'frontend/src/business/manifest.ts')
    const dynamicTargets = (manifest?.dependencies ?? [])
      .filter((d) => d.dynamic)
      .map((d) => d.resolved ?? '')
    for (const name of [
      'diversion',
      'flood-analysis',
      'forecast',
      'route-analysis',
      'site-suitability',
    ]) {
      expect(dynamicTargets).toContain(`frontend/src/business/${name}/index.ts`)
    }
  })
})
