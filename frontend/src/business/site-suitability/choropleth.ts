/**
 * 选址评分格 → 分级着色方块（choropleth）。
 *
 * 为什么不是 kde：全部 7,490 个 0.02° 格被打成半径 18px 的连续热区，
 * 相邻格的分数差被模糊掉，看上去"整片一个颜色"——梯度是抹出来的，不是算出来的。
 * 方块按分数分档着色，色阶与候选名单的分值同源（都读 score），能一眼看出
 * "这块为什么比旁边高"。
 *
 * 分档口径：**按本次结果分位（rank）切**，不是等宽、也不是按分数的分位阈值。
 * 实测这批数据分数挤在 0.5–0.97，且聚合后有大量并列值；按阈值切会出现
 * 「五档边界落到同一个数」⇒ 全图仍是同一颜色（与 kde 同病）。按秩切保证
 * 每档恒占 1/5 的格，深浅差就是这批评分里的相对高低。
 */
import type { Feature, FeatureCollection, Polygon } from 'geojson'

/** 档位数（0..4） */
const BIN_COUNT = 5

/** 各档填充透明度（同一品牌蓝，靠透明度表达高低） */
const BIN_ALPHAS = [0.06, 0.24, 0.44, 0.68, 0.92] as const

/** 一个格点在图层里的最小信息：分数 + 经纬度（几何其余字段不参与着色） */
export interface ScoredPoint {
  lng: number
  lat: number
  score: number
}

/** 档位下标 → 填充透明度 */
export function binAlpha(index: number): number {
  return BIN_ALPHAS[Math.min(Math.max(index, 0), BIN_ALPHAS.length - 1)]
}

/**
 * 按秩分配档位：升序第 rank 个格落进 floor(rank * 5 / n) 档。
 *
 * 并列值的处理：先按分数、再按坐标排序（后者只为确定性——同分格谁高谁低
 * 不影响结论，但保证两次请求渲染一致，截图可比）。
 */
function assignBins(points: readonly ScoredPoint[]): number[] {
  const order = points
    .map((p, i) => ({ i, p }))
    .sort((a, b) => a.p.score - b.p.score || a.p.lng - b.p.lng || a.p.lat - b.p.lat)
  const bins = new Array<number>(points.length).fill(0)
  const n = order.length
  order.forEach(({ i }, rank) => {
    bins[i] = Math.min(BIN_COUNT - 1, Math.floor((rank * BIN_COUNT) / n))
  })
  return bins
}

/**
 * 把评分格点转成方块要素集。
 *
 * @param points  评分格（经纬度 + 分数）
 * @param sideDeg 格边长（度），与请求的聚合分辨率同值——方块必须等于聚合格，
 *                否则会出现"一格画成大块、块块重叠"或"块比格小、露出底图"两种假象。
 *
 * 每个要素只带 `score` 与 `bin`：per-feature 样式只读这两个键，
 * 属性越少，7,490 个方块的着色回调越省（每次渲染都要读一遍）。
 */
export function choroplethFeatures(
  points: readonly ScoredPoint[],
  sideDeg: number
): FeatureCollection<Polygon, { score: number; bin: number }> {
  const half = sideDeg / 2
  const valid = points.filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat))
  const bins = assignBins(valid)

  const features: Array<Feature<Polygon, { score: number; bin: number }>> = []
  valid.forEach((p, i) => {
    const [x0, y0, x1, y1] = [p.lng - half, p.lat - half, p.lng + half, p.lat + half]
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        // 闭合环：首尾同点，OL/GeoJSON 都要求
        coordinates: [
          [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
            [x0, y0],
          ],
        ],
      },
      properties: { score: p.score, bin: bins[i] },
    })
  })
  return { type: 'FeatureCollection', features }
}
