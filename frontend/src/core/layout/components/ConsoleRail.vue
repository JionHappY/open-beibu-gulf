<!-- 中转带（手机档控制台顶部）：已完成任务结果的芯片，点一下上图 / 再点撤下。
     桌面档不用它——那里是 App.vue 的 .task-result-strip（浮在地图右下），两处消费同一份数据。

     拖拽：按住芯片移动超过阈值 → 本层抢过指针捕获（芯片自己的「松手=切换」就此失效），
     靠近 dock 的 ＋ 时半圆展开（BottomNavBar 判距）→ 松手落在某个入口上就跳该分析页；
     结果图层本来就挂在 App 作用域，换路由后仍压在新页面的地图上。 -->
<script setup lang="ts">
import type { ChipDragPoint, TaskChipView } from '../taskChipsContext'

import { ref } from 'vue'

import TaskResultChip from './TaskResultChip.vue'

defineProps<{ chips: TaskChipView[] }>()
const emit = defineEmits<{
  (e: 'toggle', key: string): void
  (e: 'dragmove', payload: ChipDragPoint): void
  (e: 'dragend', payload: ChipDragPoint): void
}>()

/** 位移超过它才算拖拽（手指比鼠标抖，比芯片自己的 6px 宽一点） */
const DRAG_THRESHOLD = 8

const dragging = ref<string | null>(null)
let originX = 0
let originY = 0
let pointerId: number | null = null

function pointOf(key: string, event: PointerEvent): ChipDragPoint {
  return { key, x: event.clientX, y: event.clientY }
}

function onDown(event: PointerEvent): void {
  originX = event.clientX
  originY = event.clientY
  pointerId = event.pointerId
  dragging.value = null
}

function onMove(event: PointerEvent, key: string): void {
  if (pointerId === null || event.pointerId !== pointerId) return
  if (dragging.value) {
    emit('dragmove', pointOf(key, event))
    return
  }
  if (Math.hypot(event.clientX - originX, event.clientY - originY) < DRAG_THRESHOLD)
    return // 抢过捕获：芯片的 pointerup 不再触发，松手不会被当成「切换图层」
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  dragging.value = key
  emit('dragmove', pointOf(key, event))
}

function onUp(event: PointerEvent, key: string): void {
  if (pointerId !== null && event.pointerId !== pointerId) return
  const wasDragging = dragging.value !== null
  dragging.value = null
  pointerId = null
  if (!wasDragging) return
  ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
  emit('dragend', pointOf(key, event))
}
</script>

<template>
  <div class="console-rail" data-testid="console-rail">
    <div
      v-for="chip in chips"
      :key="chip.key"
      class="rail-cell"
      :class="{ 'is-dragging': dragging === chip.key }"
      @pointerdown="onDown"
      @pointermove="onMove($event, chip.key)"
      @pointerup="onUp($event, chip.key)"
      @pointercancel="onUp($event, chip.key)"
    >
      <TaskResultChip
        :label="chip.label"
        :color="chip.color"
        :active="chip.active"
        @toggle="emit('toggle', chip.key)"
      />
    </div>
  </div>
</template>

<style scoped>
/* 单行横滚：芯片数量不设上限，但不许撑高控制台（控制台高度决定地图剩多少屏）。
   本体在控制台滚动区之外（见 AppLayout），自身不再需要 sticky。 */
.console-rail {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;
}

.console-rail::-webkit-scrollbar {
  display: none;
}

/* 触摸拖动芯片时不要触发页面滚动：横滚交给「拖空隙」，芯片本体是拖拽起点 */
.rail-cell {
  flex: 0 0 auto;
  touch-action: none;
}

.rail-cell.is-dragging {
  opacity: 0.55;
}

/* 中转带里只有「点一下上图/再点撤下」与「拖去别的分析」两种手势：
   桌面浮条那套「拖到地图上」的提示文案在窄屏会把芯片撑成两行，这里不搬 */
.console-rail :deep(.task-result-chip .hint) {
  display: none;
}
</style>
