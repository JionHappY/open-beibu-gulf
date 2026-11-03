import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DbService } from '../src/infra/db/db.service'

// 数据就绪守卫（真库 / beibu-gulf-data）——把「代码上线、库没跟上」的事故断言化。
//
// 立此 spec 的两次事故（2026-09-12）：
//   ① 浸没分析 500：生产缺 admin_boundary / admin_boundary_union（淹没面陆域裁剪依赖），
//      而 CI seed 每次现灌这两张表 → 生产漂移在 CI 完全不可见；
//   ② 航线分析 26s 超时：roads_noded 缺路由索引（每次查询全堆扫描 765MB；短途 3.3km 同样
//      26.9s，说明是每查询固定成本），CI 用 2 条合成边夹具 → 性能问题在 CI 完全不可见。
//
// 定位：把「仓库脚本 ↔ 库对象」的一致性固化为断言。任何迁移脚本 / seed 漂移
//（boundary 导入被删、路由索引漏建）都会在这里变红。生产侧同款只读检查见
// tools/db/verify-data-readiness.sql（部署后可直接对线上库执行）。
//
// 无库环境（V3_INTEGRATION_DB 未设）整体跳过，与 spatial.repository.spec 同口径。
// 注：本地 beibu-gulf-data 若只导入过旧 v1 路网（只有 roads_edges，没有 v2 的
// roads_vertices / route_class_profile），route 段会显式变红——这是「环境未就绪」的
// loud failure，CI（pgrouting 镜像 + ci-seed.sh）为基准。缺表时由段首「先决条件」用例
// 指名缺哪个关系、该跑哪个脚本，依赖它的两条用例跳过，不再各抛一次 relation does not exist。
const withDb = process.env.V3_INTEGRATION_DB !== undefined

/** 生产补丁落地自检锚值（2026-09-12 自检：12 / 1 / valid / 20982.70） */
const EXPECTED_UNION_AREA_KM2 = 20982.7
const AREA_TOLERANCE = 0.005

describe.skipIf(!withDb)('数据就绪守卫（真库 / beibu-gulf-data）', () => {
  let db: DbService

  beforeAll(() => {
    db = new DbService()
  })

  afterAll(async () => {
    await db?.onModuleDestroy()
  })

  // ─────────── flood 域：陆域裁剪依赖（2026-09-12 生产 500 事故） ───────────

  describe('flood 域：行政区划（淹没面陆域裁剪依赖）', () => {
    it('admin_boundary：12 个区县、SRID 4326、几何全部有效', async () => {
      const res = await db.query<{ n: string; srid: number | null; invalid: string }>(
        `SELECT count(*)::text AS n,
                min(ST_SRID(geom)) AS srid,
                count(*) FILTER (WHERE NOT ST_IsValid(geom))::text AS invalid
         FROM admin_boundary`
      )
      const row = res.rows[0]
      expect(row.n).toBe('12')
      // 4490 元数据是生产事故形态之一：与 4326 淹没面做 ST_Intersection 直接 mixed SRID
      expect(Number(row.srid)).toBe(4326)
      expect(row.invalid).toBe('0')
    })

    it('admin_boundary_union：单行、SRID 4326、面积 20982.70 km²（生产补丁自检锚值）', async () => {
      // 20982.70 与 db-import.mjs 从 frontend/public/data/site-selection/boundary.geojson
      // 的导入结果同源；容差 0.5% 只防浮点/版本差异，不放过数据源替换
      const res = await db.query<{ n: string; srid: number | null; area: number | null }>(
        `SELECT count(*)::text AS n,
                min(ST_SRID(geom)) AS srid,
                round((max(ST_Area(geom::geography)) / 1e6)::numeric, 2)::float8 AS area
         FROM admin_boundary_union`
      )
      const row = res.rows[0]
      expect(row.n).toBe('1')
      expect(Number(row.srid)).toBe(4326)
      const area = Number(row.area)
      expect(Number.isFinite(area)).toBe(true)
      expect(Math.abs(area - EXPECTED_UNION_AREA_KM2) / EXPECTED_UNION_AREA_KM2).toBeLessThan(
        AREA_TOLERANCE
      )
    })

    it('flood_levels：251 档、0.0–25.0 全覆盖（0.1 步长域）', async () => {
      const res = await db.query<{ n: string; lo: number; hi: number }>(
        `SELECT count(*)::text AS n, min(level)::float8 AS lo, max(level)::float8 AS hi
         FROM flood_levels`
      )
      const row = res.rows[0]
      expect(row.n).toBe('251')
      expect(Number(row.lo)).toBe(0)
      expect(Number(row.hi)).toBe(25)
    })
  })

  // ─────────── 选址域：物化表行数与 NULL 对账（d144） ───────────
  //
  // CI 合成种子只灌 7 格 suitability_cells；terrain_factors / access_factors 不在
  // CI seed 内，故 access_factors 的行数对账只进生产 SQL（verify-data-readiness.sql）。
  describe('选址域：物化表行数与 NULL 对账', () => {
    it('suitability_cells 行数 > 0 且结构列无 NULL；可空因子计数可查', async () => {
      const res = await db.query<{
        n: string
        bad: string
        elev: string
        slope: string
        land: string
        kde: string
      }>(
        `SELECT count(*)::text AS n,
                count(*) FILTER (
                  WHERE land_frac IS NULL OR dist_port_m IS NULL OR dist_road_m IS NULL
                )::text AS bad,
                count(*) FILTER (WHERE mean_elev_m IS NULL)::text AS elev,
                count(*) FILTER (WHERE mean_slope_deg IS NULL)::text AS slope,
                count(*) FILTER (WHERE land_class IS NULL)::text AS land,
                count(*) FILTER (WHERE kde_mass IS NULL)::text AS kde
           FROM suitability_cells`
      )
      const row = res.rows[0]
      expect(Number(row.n)).toBeGreaterThan(0)
      expect(row.bad).toBe('0')
      // 可空因子允许 NULL：CI 夹具 900007 故意缺 land_class/kde_mass；此处只要求可计数
      expect(Number(row.elev)).toBeGreaterThanOrEqual(0)
      expect(Number(row.slope)).toBeGreaterThanOrEqual(0)
      expect(Number(row.land)).toBeGreaterThanOrEqual(0)
      expect(Number(row.kde)).toBeGreaterThanOrEqual(0)
    })
  })

  // ─────────── route 域：有向图结构（2026-09-13 v2 质变） ───────────

  describe('route 域：roads_edges 有向图（迁移一致性）', () => {
    /** v2 路网的必需关系：缺失时给出导入指引，并让依赖它们的用例跳过（只留一条红） */
    let missingRelations: string[] = []
    beforeAll(async () => {
      const res = await db.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename IN ('roads_edges', 'roads_vertices', 'route_class_profile')`
      )
      const have = new Set(res.rows.map((r) => r.tablename))
      missingRelations = ['roads_edges', 'roads_vertices', 'route_class_profile'].filter(
        (t) => !have.has(t)
      )
    })

    it('先决条件：v2 路网的三个关系都在（缺表时给导入指引，而不是抛 relation does not exist）', () => {
      // 本地库的常见形态：旧 v1 只有 roads_edges，没有 v2 的 vertices / 等级档。
      // 直接跑下面的查询只会抛 `relation "roads_vertices" does not exist`，
      // 看日志的人不知道该跑哪个脚本——所以先在这里指名缺什么、该跑什么。
      expect(
        missingRelations,
        `缺少关系：${missingRelations.join('、')} —— 先跑 tools/roads/roads-graph-build.sql（v2 按 OSM node id 建图）`
      ).toEqual([])
    })

    it('pgrouting 扩展已安装', async () => {
      const res = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_extension WHERE extname = 'pgrouting'`
      )
      expect(res.rows[0].n).toBe('1')
    })

    it('roads_edges 存在且有可通行主分量边', async () => {
      const res = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM roads_edges
          WHERE (cost_m > 0 OR reverse_cost_m > 0) AND main_comp IS TRUE`
      )
      expect(Number(res.rows[0].n)).toBeGreaterThan(0)
    })

    it('每条边的两端都在 roads_vertices 中（缺顶点会让 pgr 静默丢边）', async (ctx) => {
      if (missingRelations.length) ctx.skip()
      const res = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM roads_edges e
          WHERE NOT EXISTS (SELECT 1 FROM roads_vertices v WHERE v.node_id = e.source)
             OR NOT EXISTS (SELECT 1 FROM roads_vertices v WHERE v.node_id = e.target)`
      )
      expect(res.rows[0].n).toBe('0')
    })

    it('道路等级全部在 route_class_profile 中有定义（未映射等级会静默变成不可通行）', async (ctx) => {
      if (missingRelations.length) ctx.skip()
      const res = await db.query<{ n: string; classes: string | null }>(
        `SELECT count(*)::text AS n, string_agg(DISTINCT e.class, ', ') AS classes
           FROM roads_edges e
           LEFT JOIN route_class_profile p ON p.highway = e.class
          WHERE p.highway IS NULL`
      )
      const row = res.rows[0]
      expect(row.n, `未定义的等级：${row.classes}`).toBe('0')
    })

    it('存在单向边且反向代价为 -1（oneway 属性未丢失的护栏）', async () => {
      // 旧管线的形态：oneway 全 NULL、pgr 以 directed := false 跑 → 高速可逆行。
      // 本断言把「单向数据存在且语义正确」钉在 CI 里。
      const res = await db.query<{ n: string; bad: string }>(
        `SELECT count(*) FILTER (WHERE oneway = 1 AND cost_m > 0)::text AS n,
                count(*) FILTER (WHERE oneway = 1 AND cost_m > 0 AND reverse_cost_m <> -1)::text AS bad
           FROM roads_edges`
      )
      expect(Number(res.rows[0].n)).toBeGreaterThan(0)
      expect(res.rows[0].bad).toBe('0')
    })

    it('路由覆盖索引存在（谓词与 edges_sql 一致，index-only scan 的迁移前提）', async () => {
      // 不断言 `cost_m > 0` 字面量：pg_get_indexdef 会规范化成 `cost_m > (0)::numeric`，字面匹配恒落空（实测踩过）
      const res = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM pg_index i
           JOIN pg_class t ON t.oid = i.indrelid
          WHERE t.relname = 'roads_edges'
            AND pg_get_indexdef(i.indexrelid)
                ILIKE '%INCLUDE (source, target, cost_m, reverse_cost_m, cost_min, reverse_cost_min)%'
            AND pg_get_indexdef(i.indexrelid) ILIKE '%main_comp IS TRUE%'`
      )
      expect(Number(res.rows[0].n)).toBeGreaterThan(0)
    })

    it('吸附偏索引存在（谓词=双向可通行，与 snapping 查询一致）', async () => {
      const res = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM pg_index i
           JOIN pg_class t ON t.oid = i.indrelid
          WHERE t.relname = 'roads_edges'
            AND pg_get_indexdef(i.indexrelid) ILIKE '%USING gist%'
            AND pg_get_indexdef(i.indexrelid) ILIKE '%reverse_cost_m%'`
      )
      expect(Number(res.rows[0].n)).toBeGreaterThan(0)
    })
  })

  // ─────────── 迁移登记（z050）：拦住「代码上线、库没跟上」 ───────────
  //
  // 只断言「表存在且非空」：不在此处手抄迁移清单（清单在 tools/db/schema-migrations.sql，
  // 抄一份进来即是 RC1 的第二副本）。CI 由 ci-seed.sh 灌 schema-migrations.sql；
  // 生产/本地库须先跑一次历史补录（步骤见该脚本头注释）。
  describe('迁移登记：schema_migrations', () => {
    it('schema_migrations 表存在且已补录（非空）', async () => {
      const res = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM schema_migrations`)
      expect(Number(res.rows[0].n)).toBeGreaterThan(0)
    })
  })
})
