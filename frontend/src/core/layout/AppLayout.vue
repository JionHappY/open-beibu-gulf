<script setup lang="ts">
/**
 * AppLayout - GCS（网格化布局系统）V2 布局基座
 * 用 PPS（面板定位系统）直接定位所有 Panel（无容器/Zone/TopArea），slot（Vue 插槽）供业务页注入面板内容。
 * 底部 nav 3 按钮（首页/个人中心/菜单），业务入口与城市切换在抽屉菜单中；
 * 抽屉模式（<960px）下抽屉同时承载业务面板（slot left/right）。
 */

import { computed, defineAsyncComponent, inject, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { MAP_CONFIG } from '@/core/config/map'
import { useMapControls } from '@/core/map/composables/useMapControls'
import LayerControlPanel from '@/core/map/components/LayerControlPanel.vue'
import HomeAnalysisGrid from './components/HomeAnalysisGrid.vue'
import { PanelTitle, useGCS, useTheme } from '@/shared'

import BottomNavBar from './components/BottomNavBar.vue'
import ConsoleRail from './components/ConsoleRail.vue'
import GCSPanel from './components/GCSPanel.vue'
import NavButton from './components/NavButton.vue'
import { GCS_TASK_CHIPS_KEY, type ChipDragPoint } from './taskChipsContext'
import { useSliderFocus } from './useSliderFocus'

const route = useRoute()
const router = useRouter()
const { showPanels, showTopArea, consoleMode, cellPixel } = useGCS()
const { flyTo } = useMapControls()
// 城市切换（必要性审判波次二·单元 F）：原 useScreenActions 只是 flyTo 的同义转发层，
// 就地按 MAP_CONFIG.CITY_CENTERS（单一权威源）取坐标，不新增第二份城市表。
function flyToCity(city: string): void {
  const target = MAP_CONFIG.CITY_CENTERS[city]
  if (!target) return
  flyTo({ lng: target.lng, lat: target.lat }, { height: target.height, zoom: target.zoom })
}
// 主题切换：图标显示当前模式的另一侧（暗色显示 ☀️、亮色显示 🌙）
const { isDark, toggleTheme } = useTheme()
// 抽屉开关（模块级单例，nav 菜单按钮与抽屉共享）
// 滑块专注模式（模块级单例，滑块组件调用 begin/end）
const { active: sliderFocusActive, activePanel: sliderActivePanel } = useSliderFocus()

// 任务结果芯片（手机档进控制台；桌面档由 App.vue 自己渲染浮条）。
// 未 provide 时（单测/独立挂载）为 undefined ⇒ 中转带不渲染。
const taskChips = inject(GCS_TASK_CHIPS_KEY, undefined)

/**
 * 中转带拖拽：芯片拖到 dock 的 ＋ 附近时半圆展开（判距在 BottomNavBar），
 * 松手落在弧上某项即跳该分析页——结果图层本来就挂在 App 作用域，换页后仍压在地图上。
 * 命中区用 elementFromPoint 找弧项的 data-dock-route，不新建一套坐标表。
 */
const railDragPoint = ref<{ x: number; y: number } | null>(null)

function onRailDragMove(payload: ChipDragPoint): void {
  railDragPoint.value = { x: payload.x, y: payload.y }
}

function onRailDragEnd(payload: ChipDragPoint): void {
  railDragPoint.value = null
  const target = document
    .elementFromPoint(payload.x, payload.y)
    ?.closest<HTMLElement>('[data-dock-route]')
  const path = target?.dataset.dockRoute
  if (path) void router.push(path)
}

// 抽屉业务行：取 navConfig 派生的业务项（core 不引 business，由 App.vue 注入）

// 雷达图依赖 ECharts；保持动态加载，避免布局基座把它并进首屏入口图。
const GlobalRadarPanel = defineAsyncComponent(() => import('./components/GlobalRadarPanel.vue'))

// 专注模式 class 挂 body 而非根节点：抽屉 Teleport 到 body，根节点选择器匹配不到抽屉内面板。
// body 加 slider-focus-mode（CSS 透明化其他面板），滑块所在面板标记 slider-focus-panel，底部 nav 排除。
watch(sliderFocusActive, (act) => {
  document.body.classList.toggle('slider-focus-mode', act)
  document.querySelectorAll('.GCS-panel').forEach((p) => {
    p.classList.toggle('slider-focus-panel', act && p === sliderActivePanel.value)
  })
})

// 手机档（<640）把地图压到上半屏：统一挂在 body 上，由 style.css 收 .unified-map-wrapper 高度。
// 用 body class 而非媒体查询，断点仍只由 useGCS 的 layoutTierFor 一处判定。
watch(consoleMode, (on) => document.body.classList.toggle('layout-console', on), {
  immediate: true,
})
onUnmounted(() => {
  // AppLayout 是页面级组件（HomePage/ProfilePage/业务页各自包一层），路由切换时
  // 新实例先挂、旧实例后卸；此处若同步摘 class，会把新实例刚挂上的 layout-console
  // 抹掉。真机复现：390 下从首页点「个人中心」，body 类名变空、地图撑回 844px
  // （清零的是地图上沿高度，控制台还压在它上面）。延后一拍，等新布局已在 DOM 里
  // 再判断是否真的没有任何 AppLayout 存活。
  void nextTick(() => {
    if (document.querySelector('.app-layout')) return
    document.body.classList.remove('layout-console')
  })
})
// 控制台底部让开 dock（dock 是 1 cell 高的 GCSPanel，同源取 cellPixel，不写死像素）
const consoleStyle = computed(() => ({ bottom: `${Math.round(cellPixel.value * 1.7)}px` }))

/**
 * 控制台的阅读顺序（a1）：默认「参数 → 结果」（right → left），因为多数页面右列是
 * 操作/参数；选址页反过来——先给结论（画像 + 候选名单）再给权重，所以由页面声明。
 */
withDefaults(defineProps<{ consoleOrder?: 'right-first' | 'left-first' }>(), {
  consoleOrder: 'right-first',
})

// 专注态激活期间切路由 ⇒ 旧页 AppLayout 卸载，而 useSliderFocus 的
// onScopeDispose(endSliderFocus) 与本 watch 的效果在同一批 scope.stop() 里停掉，
// 排队的 pre-flush 回调被丢弃（真 vue 3.5.41 实测 after stop: class 仍在）⇒
// body class 永久残留，style.css:350 令全站面板 opacity:0 但仍吃指针事件。
// 本组件是 body class 的唯一写方，卸载时必须显式摘除（含面板标记）。
onUnmounted(() => {
  document.body.classList.remove('slider-focus-mode')
  document.querySelectorAll('.GCS-panel.slider-focus-panel').forEach((p) => {
    p.classList.remove('slider-focus-panel')
  })
})
</script>

<template>
  <div class="app-layout">
    <!-- ===== 桌面端：绝对定位 PPS 面板（≥960px） ===== -->
    <template v-if="showPanels">
      <!-- Title Panel（4×1，左上，第一行） -->
      <GCSPanel
        v-show="showTopArea"
        :w="4"
        :h="1"
        anchor="top-left"
        :offset-x="0"
        :offset-y="0"
        class="title-panel"
      >
        <PanelTitle :title="(route.meta?.title as string) || '北部湾智慧港口平台'" />
      </GCSPanel>

      <!-- 顶部城市切换按钮组（4×1 右上，档位 1 原位显示；<960px 时在抽屉菜单内） -->
      <GCSPanel
        v-show="showTopArea"
        :w="4"
        :h="1"
        anchor="top-right"
        :offset-x="0"
        :offset-y="0"
        class="top-button-panel"
      >
        <div class="top-button-inner">
          <!-- 城市列表由 MAP_CONFIG.CITY_CENTERS 驱动（勿手写城市名双轨） -->
          <NavButton
            v-for="city in Object.keys(MAP_CONFIG.CITY_CENTERS)"
            :key="city"
            :label="city"
            @click="flyToCity(city)"
          />
          <!-- 主题切换（🌙/☀️） -->
          <NavButton
            :icon="isDark ? '☀️' : '🌙'"
            class="theme-toggle"
            aria-label="切换主题"
            @click="toggleTheme"
          />
        </div>
      </GCSPanel>

      <!-- 左侧 Panel 组：由业务页通过 #left slot 注入 -->
      <slot name="left" />

      <!-- 右侧 Panel 组 -->
      <div v-show="showPanels">
        <slot name="right">
          <!-- 右上：雷达图 4×4（与选址分析同源：分析结果第一名，未分析时快照兜底） -->
          <GlobalRadarPanel />
          <!-- 右下：图层控制 4×4 -->
          <GCSPanel :w="4" :h="4" anchor="top-right" :offset-x="0" :offset-y="5.5">
            <LayerControlPanel />
          </GCSPanel>
        </slot>
        <!-- 图层控制单独一口：桌面档按 placements 绝对定位，位置与在 #right 里无差别；
             手机档控制台按「参数 → 结果 → 图层」排阅读顺序，必须能把它排到最后 -->
        <slot name="layers" />
      </div>
    </template>

    <!-- ===== 控制台（手机档 <640px） =====
         地图收上半屏，原抽屉里的图层控制 / 业务面板整体搬到下半屏（压缩排版，尽量一屏放完）。
         抽屉在手机档不再渲染——入口是 dock 的 ＋ 半圆，内容是这张控制台。 -->
    <section v-if="consoleMode" class="mobile-console" :style="consoleStyle" aria-label="控制台">
      <!-- 中转带：已完成任务结果的芯片，点一下上图/撤下（App 供给，桌面档在右下浮条里）。
           放在滚动区外：结果下来时控制台常已滚到参数区，放在里面会跟着滚走 -->
      <ConsoleRail
        v-if="taskChips && taskChips.chips.value.length"
        :chips="taskChips.chips.value"
        @toggle="taskChips.toggle"
        @dragmove="onRailDragMove"
        @dragend="onRailDragEnd"
      />
      <div class="console-head">
        <span class="console-title">{{
          (route.meta?.title as string) || '北部湾智慧港口平台'
        }}</span>
        <div class="console-cities">
          <NavButton
            v-for="city in Object.keys(MAP_CONFIG.CITY_CENTERS)"
            :key="city"
            :label="city"
            @click="flyToCity(city)"
          />
          <NavButton
            :icon="isDark ? '☀️' : '🌙'"
            class="theme-toggle"
            aria-label="切换主题"
            @click="toggleTheme"
          />
        </div>
      </div>
      <div class="console-body">
        <template v-if="route.name === 'Home'">
          <HomeAnalysisGrid />
          <div class="console-card"><LayerControlPanel /></div>
        </template>
        <template v-else-if="route.name === 'Profile'">
          <slot name="right" />
        </template>
        <template v-else-if="consoleOrder === 'left-first'">
          <slot name="left" />
          <!-- 参数默认折叠成一条：结果页先给结论，调参是第二动作（a1） -->
          <details class="console-fold">
            <summary>调参：准则权重与阈值</summary>
            <slot name="right" />
          </details>
          <slot name="layers" />
        </template>
        <template v-else>
          <slot name="right" />
          <slot name="left" />
          <!-- 图层控制放最后：控制台是按 DOM 顺序自上而下读的 -->
          <slot name="layers" />
        </template>
      </div>
    </section>

    <!-- 底部导航（3 按钮：首页/个人中心/菜单） -->
    <BottomNavBar :drag-point="railDragPoint" />
  </div>
</template>

<style scoped>
.app-layout {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: var(--GCS-z-layout); /* 壳层档（原散落 50） */
}

/* 所有 Panel 子元素恢复 pointer-events */
.app-layout > * {
  pointer-events: auto;
}

/* Title Panel 容器样式 */
.title-panel {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 顶部城市切换按钮组内部样式 */
.top-button-panel {
  display: flex;
  align-items: center;
  justify-content: center;
}

.top-button-inner {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-around;
  box-sizing: border-box;
}

/* ===== 手机档控制台 ===== */
.mobile-console {
  position: absolute;
  left: 0;
  right: 0;
  top: 46vh;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background-color: var(--GCS-bg-container);
  border-top: 1px solid var(--GCS-border-light);
  pointer-events: auto;
  box-sizing: border-box;
}

.console-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: none;
}

.console-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--GCS-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.console-cities {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.console-cities :deep(.GCS-button) {
  --GCS-button-w: 44px;
  --GCS-button-h: 26px;

  font-size: 11px;
}

/* 内容区唯一可滚动的地方；面板改为正常流堆叠，压缩后尽量一屏放完 */
.console-fold > summary {
  padding: 6px 8px;
  font-size: 12px;
  color: var(--GCS-text-regular);
  background: var(--GCS-bg-container);
  border: 1px solid var(--GCS-border-light);
  border-radius: 6px;
  cursor: pointer;
}

.console-fold[open] > summary {
  margin-bottom: 4px;
}

.console-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 4px;

  /* 末端留白：最后一行（如年份刻度）贴到滚动区底边时会被 dock 上沿的
     拖拽手柄压住半个字，实测 390×844 预测页 */
  padding-bottom: 12px;
}

.console-card {
  background-color: var(--GCS-bg-panel);
  border-radius: var(--GCS-radius-md);
  box-shadow: var(--GCS-shadow-sm);
  padding: 6px;
}

/* 面板进控制台后按内容高度堆叠。
   GCSPanel 把 left/top/width/height 写成内联 CSS 变量，所以这里必须 !important 才压得住
   （抽屉退役后这里是唯一的「面板进普通流」归一化点）。 */
.console-body :deep(.GCS-panel) {
  /* 选择器特异度（.console-body[data-v-x] .GCS-panel）已经高于 .GCS-panel 自身，
     这里不需要 !important——GCSPanel 的定位走的是 CSS 变量，不是内联属性 */
  position: static;
  width: 100%;
  height: auto;
  min-width: 0;
  min-height: 0;
  margin: 0;
  overflow: visible;

  /* flex 列里不能压缩：被压扁时内层内容会溢出到面板外、盖住 dock */
  flex: 0 0 auto;
  padding: 6px;
}

.console-body :deep(.GCS-panel > *) {
  height: auto;
}

/* 图表给确定高度：面板改 auto 后 flex:1 的挂载点会塌成 0，ECharts 按 0 高初始化。
   170 不是随手取的：CHART_GRID 上下各留 40px（标题 + 图例），110px 时绘图区只剩 30px，
   纵轴刻度挤在一起、双轴图右侧 700,000 这类六位数会被画布边缘裁掉；150px 仍会重叠，
   170px 是实测刻度互不压且右轴完整的第一个高度。 */
.console-body :deep(.line-chart),
.console-body :deep(.bar-chart),
.console-body :deep(.suit-radar-chart),
.console-body :deep(.transfer-chart),
.console-body :deep(.chart-container) {
  flex: 0 0 auto;
  height: 170px;
}

/* 图层控制在控制台里按「2×1 GCS 按钮」排：列数与行高由组件按容器实测宽度反推
   （LayerControlPanel 的 compactGridStyle 写入 --layer-cols/--layer-row-h/--layer-gap），
   这里只负责解除面板内的高度约束，不再写死列数与行高——
   写死过 3 列 / 44px，与组件的 2×1 尺寸各说各话（用户截图：比城市按钮和 dock 宽一档）。 */
.console-body :deep(.layer-grid) {
  grid-template-columns: repeat(var(--layer-cols, 3), 1fr);
  grid-auto-rows: var(--layer-row-h, 44px);
  height: auto;
  overflow: visible;
}

.console-body :deep(.layer-btn) {
  flex-direction: row;
  gap: 4px;
  padding: 0 6px;
  font-size: var(--layer-font, 12px);
}

.console-body :deep(.layer-icon) {
  font-size: calc(var(--layer-font, 12px) * 1.1);
}

/* 浸没报告的内容区在桌面档用绝对定位钉在 2.8cell 的灰框里（宽高 top/left 都是内联算出来的）。
   控制台里面板高度是 auto，绝对定位的内容不再为面板贡献高度 ⇒ 面板塌成标题那条、
   报告行整块溢到下一块面板上。这里把它放回正常流，高度由行数决定。 */
.console-body :deep(.flood-analysis-report-panel .report-content) {
  position: static !important;
  width: auto !important;
  height: auto !important;
  top: auto !important;
  left: auto !important;
}

/* 个人中心是「占满 4×8 面板」写的：内容区 height:100% + 子块 flex:1 1 0。
   控制台里面板高度变 auto 后，flex-basis 0 的子块会被算成 0 高、再被内容区的
   overflow:hidden 裁掉，只剩顶上一条。这里让它们按内容展开。 */
.console-body :deep(.profile-content) {
  height: auto !important;
  overflow: visible !important;
}

.console-body :deep(.profile-login),
.console-body :deep(.profile-logged-in) {
  flex: 0 0 auto !important;
}

/* 压缩：面板内的区块间距与字号整体收一档（目标是一屏放完，不靠滑） */
.console-body :deep(.GCS-panel) {
  font-size: 11.5px;
  line-height: 1.35;
}

/* 内容区不许再按 cell 高度 flex 撑满 */
.console-body :deep(.GCS-panel > * > *) {
  min-height: 0;
}

.console-body :deep(.GCS-panel .layer-grid),
.console-body :deep(.GCS-panel .btn-grid),
.console-body :deep(.GCS-panel .criteria-grid) {
  gap: 4px;
}

/* ===== 抽屉菜单 ===== */

/* 业务入口行冻结：控制台滚动时保持可见（sticky 相对 .console-body） */

/* 主题切换按钮 emoji 放大（默认偏小，仅作用于 .theme-toggle） */
:deep(.theme-toggle .button-icon) {
  font-size: 1.6em;
  margin-top: 0;
}
</style>
