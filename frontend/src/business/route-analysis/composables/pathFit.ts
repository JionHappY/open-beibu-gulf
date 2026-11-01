/**
 * 路径结果取景：由折线 bbox 推导相机中心，由路径长度推导 3D 高度。
 *
 * 为什么单独成纯函数：相机是否覆盖整条路径无法在 E2E 里稳定断言，
 * 但「bbox → 中心 / 长度 → 高度」是纯数学，可以用单测钉死（111km 路线必须给出 >100km 高度），
 * 避免再次出现「查询完成但相机停在终点」这类只能靠人眼发现的问题。
 *
 * 为什么用路径长度而不是 bbox 对角线的米数：经纬度→米的常量在 tools/lib/geo.mjs 是唯一源，
 * 前端再抄一份 111320 会被 `geo.test.mjs` 判红（实测踩到）。路径长度是 bbox 对角线的上界，
 * 按它取高度只会略宽、不会裁掉路径末端；2D 仍由渲染器按 heightToZoom 反推。
 */
export interface PathView {
  center: { lng: number; lat: number }
  /** 3D 相机高度（米） */
  height: number
}

/** 60° 视场覆盖长度约需 0.87 倍；乘 1.4 留边距，同时容忍路径弯曲（bbox 小于里程） */
const FIT_FACTOR = 1.4
const MIN_HEIGHT_M = 2000

export function fitViewForPath(
  coordinates: ReadonlyArray<readonly [number, number]>,
  pathLengthM: number
): PathView | null {
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const [lng, lat] of coordinates) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null

  const center = { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 }
  const length = Number.isFinite(pathLengthM) && pathLengthM > 0 ? pathLengthM : 0

  return { center, height: Math.max(length * FIT_FACTOR, MIN_HEIGHT_M) }
}
