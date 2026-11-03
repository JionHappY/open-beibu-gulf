/**
 * 迟到响应的统一闸（从 `FloodAnalysisPage` 抽出，2026-11-02）。
 *
 * 两条独立判据：
 * 1. 路由引擎与当前渲染器不一致 ⇒ **丢弃**（防把 3D 页的图层画到 2D 页、防离开后图层复活）。
 * 2. 渲染器尚未就绪（`actualEngine === null`）⇒ **放行**。写 store 与登记图层不依赖渲染器，
 *    视觉创建由 `BusinessLayerManager` 在就绪后补建（`reapplyAll`，与「预测图层在渲染器
 *    就绪后注册」同一契约）。
 *
 * 🔴 2 的反例就是本模块抽出的原因：旧实现 `if (!actual) return false`，而水位 0 时后端
 *    ~50ms 就返回、早于 Cesium 就绪 ⇒ 整轮结果被静默丢掉，报告面板停在「暂无淹没分析
 *    结果」，直到用户再动一次滑块（实测日志里 flood-areas 200 但没有「更新淹没分析数据」）。
 */
interface LateResponseContext {
  /** 当前渲染器引擎；`null` = 渲染器还没建好 */
  actualEngine: string | null
  /** 本路由声明的引擎（`route.meta.engine`） */
  expectedEngine: string | null | undefined
  /** 页面是否已卸载 */
  unmounted: boolean
}

export function acceptLateResponse({
  actualEngine,
  expectedEngine,
  unmounted,
}: LateResponseContext): boolean {
  if (unmounted) return false
  if (!actualEngine) return true
  return expectedEngine === actualEngine
}
