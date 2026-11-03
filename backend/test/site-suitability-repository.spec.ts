// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { SiteSuitabilityRepository } from '../src/modules/site-suitability/repositories/site-suitability.repository'

function repoWithSqlCapture() {
  const query = vi.fn().mockResolvedValue({ rows: [] })
  const repo = new SiteSuitabilityRepository({ query } as never)
  return { repo, query }
}

describe('site-suitability repository 确定定序', () => {
  it('🔴 全分辨率分支有最终 ORDER BY id', async () => {
    const { repo, query } = repoWithSqlCapture()
    await repo.fetchCellsAt(0.5, 0.99, 0)
    expect(query.mock.calls[0][0]).toMatch(/ORDER BY id\s*$/m)
  })

  it('🔴 聚合分支有最终 ORDER BY id', async () => {
    const { repo, query } = repoWithSqlCapture()
    await repo.fetchCellsAt(0.5, 0.99, 0.02)
    expect(query.mock.calls[0][0]).toMatch(/GROUP BY[\s\S]*ORDER BY id\s*$/m)
  })
})

describe('site-suitability repository 陆地占比上下限', () => {
  it('🔴 两个分支都把上限写进 WHERE（只有下限 ⇒ 内陆格回流）', async () => {
    const { repo, query } = repoWithSqlCapture()
    await repo.fetchCellsAt(0.5, 0.99, 0)
    expect(query.mock.calls[0][0]).toMatch(/land_frac >= \$1 AND land_frac <= \$2/)
    expect(query.mock.calls[0][1]).toEqual([0.5, 0.99, Number.POSITIVE_INFINITY])

    await repo.fetchCellsAt(0.5, 0.99, 0.02)
    expect(query.mock.calls[1][0]).toMatch(/land_frac >= \$1 AND land_frac <= \$2/)
    expect(query.mock.calls[1][1]).toEqual([0.5, 0.99, Number.POSITIVE_INFINITY, 0.02])
  })
})

describe('site-suitability repository 港口距离上限', () => {
  it('🔴 两个分支都把 dist_port_m 上限写进 WHERE 且参数位对得上', async () => {
    const { repo, query } = repoWithSqlCapture()
    await repo.fetchCellsAt(0.5, 0.99, 0, 50_000)
    expect(query.mock.calls[0][0]).toMatch(/dist_port_m <= \$3/)
    expect(query.mock.calls[0][1]).toEqual([0.5, 0.99, 50_000])

    await repo.fetchCellsAt(0.5, 0.99, 0.02, 50_000)
    expect(query.mock.calls[1][0]).toMatch(/dist_port_m <= \$3/)
    // 聚合分支把 resolution 顺延到 $4，端口里程留在 $3
    expect(query.mock.calls[1][1]).toEqual([0.5, 0.99, 50_000, 0.02])
  })
})

describe('site-suitability repository 出库坐标 SRID', () => {
  it('🔴 全分辨率与聚合分支都显式转 4326（源表 4490）', async () => {
    const { repo, query } = repoWithSqlCapture()
    await repo.fetchCellsAt(0.5, 0.99, 0)
    expect(query.mock.calls[0][0]).toContain('ST_X(ST_Transform(geom, 4326))')
    expect(query.mock.calls[0][0]).toContain('ST_Y(ST_Transform(geom, 4326))')

    await repo.fetchCellsAt(0.5, 0.99, 0.02)
    const aggregated = query.mock.calls[1][0]
    expect(aggregated).toContain('ST_Transform(ST_Centroid(ST_Collect(geom)), 4326)')
    expect(aggregated).toContain('GROUP BY floor(ST_X(ST_Transform(geom, 4326)) / $4)')
  })
})
