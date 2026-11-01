import { defineAsyncComponent } from 'vue'

import { ChartLoading } from '@/shared'

/** 首页/个人页共用：占位走 shared，图表 barrel 只在异步 loader 里加载。 */
export const LazyLineChart = defineAsyncComponent({
  loader: () => import('@/visualization').then((m) => m.LineChart),
  loadingComponent: ChartLoading,
})

export const LazyBarChart = defineAsyncComponent({
  loader: () => import('@/visualization').then((m) => m.BarChart),
  loadingComponent: ChartLoading,
})
