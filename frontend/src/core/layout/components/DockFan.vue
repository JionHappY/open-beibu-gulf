<script lang="ts">
export default { name: 'GCSDockFan' }
</script>
<script setup lang="ts">
/**
 * DockFan - 档位 3（<640px）dock 中心的 ＋ 号展开半圆
 *
 * ## 为什么是半圆
 *
 * dock 贴着视口底边，向上没有可用空间时只能往垂直方向堆——那正是现在被诟病的
 * 「5 个业务键挤成一行」。半圆把 5 个入口摊在一个 180° 的弧上：拇指从 ＋ 出发
 * 到任一入口的位移都一样（R 恒定），比横向列表更省一次瞄准。
 *
 * ## 几何不写死 px
 *
 * 圆心 = ＋ 按钮的实时 `getBoundingClientRect()`，半径按 `cellPixel × 2.4` 派生：
 * cell 随视口缩放（`useGCS`），弧和各入口跟着缩放，窄屏不溢出、平板不缩成一点。
 * 每项用 `translate(-50%, -50%)` 定位到自己的圆心点，因此按钮尺寸变化不改变弧线。
 *
 * ## 与 dock 的关系
 *
 * `Teleport` 到 body：`GCSPanel` 有 `overflow: hidden`（面板内容不得溢出），
 * 半圆必须画在面板外，否则会被裁掉上半截。层级只比 dock 高 1，不盖抽屉/弹层。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEscapeClose, useFocusTrap, useGCS } from '@/shared'

import type { NavItem } from '../navConfig'

import NavButton from './NavButton.vue'

interface Props {
  /** 圆弧上的入口（业务页 + 更多） */
  items: NavItem[]
  /** ＋ 按钮元素：圆心与半径的锚点 */
  anchorEl: HTMLElement | null
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ select: [item: NavItem]; close: [] }>()

const { cellPixel } = useGCS()

/** 横向半径（cell 数）：弧的左右展开量；再宽在 390px 下两端就贴边了 */
const RADIUS_X_CELL = 1.62
/** 纵向半径（cell 数）：比横向大，弧才会往上翻开、落到地图上而不是压在控制台上 */
const RADIUS_Y_CELL = 2.4
/** 圆心抬升（cell 数）：让弧的左右两端离开 dock 本体，不被按钮压住 */
const BASE_LIFT_CELL = 1.15

const origin = ref({ x: 0, y: 0 })

function measure(): void {
  const el = props.anchorEl
  if (!el) return
  const r = el.getBoundingClientRect()
  origin.value = { x: r.left + r.width / 2, y: r.top }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    // 展开瞬间 dock 可能还在布局，等一帧再量
    await nextTick()
    measure()
  }
)

function onWindowResize(): void {
  if (props.open) measure()
}

function onDocPointerDown(e: PointerEvent): void {
  const t = e.target as HTMLElement | null
  if (!t) return
  // 点 ＋ 自身由 BottomNavBar 处理（toggle）；点弧内项由各自 click 处理
  if (t.closest('.dock-fan') || t.closest('.dock-plus-wrap')) return
  emit('close')
}

useEscapeClose(() => emit('close'))

/* ===== 键盘焦点 =====
 * 半圆是带遮罩的浮层：遮罩底下的控件被盖住、鼠标点不到，键盘却还能 Tab 进去，
 * 于是「看不见的按钮能按」。焦点进入 / 循环 / 回焦统一走 useFocusTrap。 */
const rootRef = ref<HTMLElement | null>(null)
const trap = useFocusTrap(rootRef, () => props.open)

function onSelect(item: NavItem): void {
  // 选中即跳路由：关闭时不把焦点抢回旧页面的 ＋
  trap.release()
  emit('select', item)
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
  document.addEventListener('pointerdown', onDocPointerDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})

/** 弧上各入口的视口坐标：180°（左）→ 0°（右），自左向右排 */
const slots = computed(() => {
  const n = props.items.length
  // 半径同时受「拇指舒适距离」和「视口宽度」约束：窄屏按可用宽度反算，
  // 否则弧的两端会滑出屏幕（390px 下 2.4 cell 的弧比屏还宽）
  const itemHalf = cellPixel.value * 0.4 + 8
  const fitHalf = Math.max(cellPixel.value * 1.2, window.innerWidth / 2 - itemHalf - 10)
  // 椭圆而不是正圆：横向受屏幕宽度约束（窄屏两端不能出界），纵向自由，
  // 于是 5 个入口往上翻到地图上方，横向仍收在拇指一张手之内
  const rx = Math.min(cellPixel.value * RADIUS_X_CELL, fitHalf)
  const ry = cellPixel.value * RADIUS_Y_CELL
  const lift = cellPixel.value * BASE_LIFT_CELL
  return props.items.map((item, i) => {
    const angle = n === 1 ? 90 : 180 - (180 * i) / (n - 1)
    const rad = (angle * Math.PI) / 180
    return {
      item,
      x: Math.round(origin.value.x + Math.cos(rad) * rx),
      y: Math.round(origin.value.y - lift - Math.sin(rad) * ry),
    }
  })
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dock-fan">
      <div
        v-if="open"
        ref="rootRef"
        class="dock-fan"
        role="menu"
        aria-label="分析入口"
        @keydown="trap.onKeydown"
      >
        <!-- 压暗底下的控制台：弧上的入口要能读，不能和面板按钮糊成一片 -->
        <div class="dock-fan__scrim" aria-hidden="true" @click="emit('close')"></div>
        <div
          v-for="(slot, i) in slots"
          :key="slot.item.path"
          class="dock-fan__item"
          :data-dock-route="slot.item.path"
          :style="{
            left: `${slot.x}px`,
            top: `${slot.y}px`,
            '--i': i,
          }"
          role="none"
        >
          <NavButton
            :label="slot.item.label"
            :icon="slot.item.icon"
            :disabled="slot.item.disabled"
            :active="false"
            :task-route="slot.item.path"
            @click="onSelect(slot.item)"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dock-fan {
  position: fixed;
  inset: 0;

  /* 容器不拦截指针：只有弧上的按钮可点，其余区域仍可操作地图 */
  pointer-events: none;

  /* 高于底部导航（nav=60）、低于抽屉/弹窗，复用浮动面板刻度 */
  z-index: var(--GCS-z-panel-float);
}

/* 遮罩只压暗、不接管键盘焦点；点它等同点空白处收起 */
.dock-fan__scrim {
  position: absolute;
  inset: 0;
  background: var(--GCS-bg-overlay);
  pointer-events: auto;
}

.dock-fan__item {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: auto;

  /* 展开动画：从圆心往外弹，逐项 25ms 错峰（近的先生） */
  animation: dock-fan-in 0.18s ease-out both;
  animation-delay: calc(var(--i) * 25ms);
}

@keyframes dock-fan-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.4);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

/* 收起：整体淡出，不再逐项错峰（收起要快，不能拖泥带水） */
.dock-fan-leave-active .dock-fan__item {
  animation: none;
}

.dock-fan-enter-active,
.dock-fan-leave-active {
  transition: opacity 0.12s ease-out;
}

.dock-fan-enter-from,
.dock-fan-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .dock-fan__item {
    animation: none;
  }
}
</style>
