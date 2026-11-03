/**
 * 图表序列的公共形状（纯类型层）。
 *
 * `data` 允许 null：ECharts 用空档表示「该点没有值」——同比视图里 t−12 期缺失就是 null，
 * 不能拿 0 顶替（0 是一条有意义的读数，会让折线从缺口变成贴地）。
 * `yAxisIndex` 只有双轴图（港口对比的货类/集装箱各一根轴）才给，单轴图省略。
 */
export interface ChartSeries {
  name: string
  data: Array<number | null>
  yAxisIndex?: number
}
