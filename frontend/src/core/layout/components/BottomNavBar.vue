<script lang="ts">
export default { name: 'GCSBottomNavBar' }
</script>
<script setup lang="ts">
/**
 * BottomNavBar - 底部业务导航条（消费 navConfig 注入项，core 不引 business）
 * 三档形态：档位 1（≥960px）首页+业务+个人中心原位、无菜单键；
 * 档位 2（640~959px）追加菜单键；档位 3（<640px）首页 / ＋ / 个人中心——
 * 业务入口收进 ＋ 展开的半圆（DockFan），菜单作为半圆末项保留抽屉入口。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useGCS } from '@/shared'

import { preloadCesium } from '../../map/renderers'
import { businessNavItems, type NavItem, navItems } from '../navConfig'
import { getTaskIndicator, taskIndicatorVersion } from '../taskIndicator'
import { useMobileDrawer } from '../useMobileDrawer'

import DockFan from './DockFan.vue'
import GCSButton from './GCSButton.vue'
import GCSPanel from './GCSPanel.vue'
import NavButton from './NavButton.vue'
import TaskProgressRing from './TaskProgressRing.vue'

const route = useRoute()
const router = useRouter()
const { cellPixel, navCompact, showPanels } = useGCS()
// 抽屉开关（模块级单例）：菜单按钮与抽屉共享，激活时高亮
const { drawerOpen, toggleDrawer } = useMobileDrawer()

/** 中转带正在拖拽的指针位置（AppLayout 传入）；靠近 ＋ 时半圆自动展开，松手才落点 */
const props = withDefaults(defineProps<{ dragPoint?: { x: number; y: number } | null }>(), {
  dragPoint: null,
})

const homeItem = computed(() => navItems.value.find((i) => i.type === 'home'))
const profileItem = computed(() => navItems.value.find((i) => i.type === 'profile'))

// 手机档的入口就是这 5 个分析页：抽屉内容已迁到下半屏控制台，弧上不再需要「更多」
const fanItems = computed<NavItem[]>(() => [...businessNavItems.value])

/** 档位 3：首页 / ＋ / 个人中心 三格；其余档位：全部项 + 菜单键 */
const dockCellCount = computed(() =>
  navCompact.value ? 3 : navItems.value.length + (showPanels.value ? 0 : 1)
)

const fanOpen = ref(false)

// 半圆展开时把控制台藏起来：弧上的入口就压在控制台正上方，两层按钮叠在一起读不清。
// 用 body class 下发（AppLayout 的 .mobile-console 在兄弟组件里，拿不到 scoped 样式）。
watch(fanOpen, (on) => document.body.classList.toggle('dock-fan-open', on), { immediate: true })
onUnmounted(() => document.body.classList.remove('dock-fan-open'))
const plusRef = ref<HTMLElement | null>(null)

/**
 * 拖拽中转带芯片时，指针进入 ＋ 周围就展开半圆：用户不必先松手再点一次 ＋，
 * 而是「拖过去 → 弧自己张开 → 直接落在某个分析上」。判定半径按 cell 缩放，
 * 手机档 ±2 屏宽内都算（弧展开后入口离 ＋ 最多 1.6 cell）。
 */
const FAN_REACH_CELL = 2
watch(
  () => props.dragPoint,
  (point) => {
    if (!point || !navCompact.value || fanOpen.value) return
    const el = plusRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const distance = Math.hypot(
      point.x - (rect.left + rect.width / 2),
      point.y - (rect.top + rect.height / 2)
    )
    if (distance <= cellPixel.value * FAN_REACH_CELL) fanOpen.value = true
  }
)

function toggleFan(): void {
  fanOpen.value = !fanOpen.value
}

/**
 * ＋ 的环：扇区里有任务在跑时，收起的 ＋ 必须能提示「有东西在后台」，
 * 否则用户不知道要展开。展开后由各入口自己的环表达，＋ 收起环避免双重指示。
 */
const plusRing = computed(() => {
  void taskIndicatorVersion.value
  if (fanOpen.value) return null
  for (const item of businessNavItems.value) {
    const ind = getTaskIndicator(item.path)
    if (ind.occupied) {
      return { status: ind.status, progress: ind.progress, indeterminate: false }
    }
  }
  return null
})

/** 半圆里选项：跳路由并收起（弧上已无抽屉入口，不存在空 path 分支） */
function onFanSelect(item: NavItem): void {
  fanOpen.value = false
  if (!item.path) return
  void router.push(item.path)
}

// dock 宽度上限（防溢出兜底）：min(dock cell 宽度, 视口宽 - 16px)
const dockWidthCapCss = computed(
  () => `min(${dockCellCount.value * cellPixel.value}px, calc(100vw - 16px))`
)

function isActive(path: string): boolean {
  return route.path === path
}

function go(item: NavItem): void {
  if (item.disabled || !item.path) return
  void router.push(item.path)
}

/**
 * 3D 意图预取（2026-10-01，治 z037「点不进 浸没分析」）
 *
 * 背景：3D 页首次进入需现场下载 Cesium.js（5.8MB）并建首帧；真机限速实测
 * 进入耗时 10–16s，用户体感即"点了没反应/点不进去"（实测点击从未被吞：
 * 全屏「地图加载中」遮罩在地图层 stacking context 内，导航 z 序在其上）。
 *
 * 不在启动时全量预载：App.vue 的预热队列刻意错峰到 load 后 +3s，避免抢首屏带宽。
 * 这里只在**指针悬停/键盘聚焦 3D 导航项**时按需预取——意图明确、对首屏零成本；
 * 且 preloadCesium 是模块级幂等 promise，重复触发不产生重复下载。
 */
function preloadIf3D(item: NavItem): void {
  if (item.disabled || !item.path) return
  if (router.resolve(item.path).meta?.engine === '3d') preloadCesium()
}
</script>

<template>
  <GCSPanel
    :w="dockCellCount"
    :h="1"
    anchor="bottom-center"
    :offset-x="0"
    :offset-y="0"
    class="bottom-nav-bar dock-panel"
    :class="{ 'nav-compact': navCompact }"
    :style="{ maxWidth: dockWidthCapCss }"
  >
    <div class="nav-inner">
      <!-- 档位 3：首页 / ＋ / 个人中心（业务入口收进半圆） -->
      <template v-if="navCompact">
        <NavButton
          v-if="homeItem"
          :label="homeItem.label"
          :icon="homeItem.icon"
          :disabled="homeItem.disabled"
          :active="isActive(homeItem.path)"
          :task-route="homeItem.path"
          @click="go(homeItem)"
        />
        <div ref="plusRef" class="dock-plus-wrap" :class="{ 'is-open': fanOpen }">
          <GCSButton :w="1" :h="1" label="" icon="＋" :active="fanOpen" @click="toggleFan" />
          <span v-if="plusRing" class="nav-button-ring">
            <TaskProgressRing
              :size="Math.round(cellPixel + 8)"
              :progress="plusRing.progress"
              :status="plusRing.status ?? 'pending'"
              :indeterminate="plusRing.indeterminate"
            />
          </span>
        </div>
        <NavButton
          v-if="profileItem"
          :label="profileItem.label"
          :icon="profileItem.icon"
          :disabled="profileItem.disabled"
          :active="isActive(profileItem.path)"
          :task-route="profileItem.path"
          @click="go(profileItem)"
        />
      </template>

      <!-- 档位 1/2：全量导航项原位 -->
      <template v-else>
        <NavButton
          v-for="item in navItems"
          :key="item.label"
          :label="item.label"
          :icon="item.icon"
          :disabled="item.disabled"
          :active="isActive(item.path)"
          :task-route="item.path"
          @click="go(item)"
          @mouseenter="preloadIf3D(item)"
          @focusin="preloadIf3D(item)"
        />
        <!-- 菜单键（抽屉模式 640~959px） -->
        <GCSButton
          v-if="!showPanels"
          :w="0.8"
          :h="0.8"
          label="菜单"
          icon="☰"
          :active="drawerOpen"
          @click="toggleDrawer"
        />
      </template>
    </div>

    <!-- 档位 3 的四分之一圆弧入口：Teleport 到 body（GCSPanel 有 overflow:hidden） -->
    <DockFan
      v-if="navCompact"
      :items="fanItems"
      :anchor-el="plusRef"
      :open="fanOpen"
      @select="onFanSelect"
      @close="fanOpen = false"
    />
  </GCSPanel>
</template>

<style scoped>
.bottom-nav-bar {
  z-index: var(--GCS-z-nav); /* 导航档（原散落 60） */
  pointer-events: auto;
}

/* 档位 3 dock 只有 3 键：按钮保持固定尺寸，由 space-around 分配间距
 * （flex:1 均分会导致无剩余空间、间距归零） */
.bottom-nav-bar.nav-compact {
  min-width: 0 !important;
}

/* ＋ 按钮：与 NavButton 同宽的外壳，环绝对定位覆盖（口径同 NavButton） */
.dock-plus-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ＋ 是半圆入口：GCSButton 的 .button-icon 默认 0.85em，1 cell 按钮里只剩 14px，压不住 dock */
.dock-plus-wrap :deep(.button-icon) {
  font-size: 26px;
  line-height: 1;
  opacity: 1;
}

/* 空 label 不占行高（否则图标被挤到按钮下半截） */
.dock-plus-wrap :deep(.button-label:empty) {
  display: none;
}

.nav-button-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;

  /* 🔴 不拦截点击：环是纯视觉反馈层 */
  pointer-events: none;
}

.nav-inner {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-around;
  box-sizing: border-box;
}
</style>
