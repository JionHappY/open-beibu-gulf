<script setup lang="ts">
/**
 * TaskResultChip — 已完成任务结果的"拖出上图"芯片（v4-S8 系统 C 的触发端）。
 *
 * 纯 UI 组件（core 不接 store——数据由 App.vue 顶层供给，同 TaskDropZone 先例）：
 * 一个 chip 对应一个「终态且可渲染」的任务结果，交互：
 *   - 点击或拖拽（≥6px 位移）后松开 ⇒ emit toggle（上图/撤下由父层决定，本组件不碰 BLM）
 *   - 拖拽期本体以 transform 跟手（松手回位——它是"把手"，不是图层本体）
 */
import { ref } from 'vue'

import { IR_FALLBACK_COLOR } from '@/shared'

const props = withDefaults(
  defineProps<{
    label: string
    color?: string
    /** 是否已上图（已上图时 chip 高亮描边，提示再拖=撤下） */
    active?: boolean
  }>(),
  { color: IR_FALLBACK_COLOR, active: false }
)

const emit = defineEmits<{
  (e: 'toggle'): void
  /** 位移超过阈值后松手：带宽移前后的坐标，父层据此判断落点是否命中导航项 */
  (e: 'dragend', payload: { x: number; y: number }): void
}>()

/** 与中转带同阈值：超过它才算拖拽，松手不再当「切换图层」 */
const DRAG_THRESHOLD = 8

const dragging = ref(false)
let startX = 0
let startY = 0
let moved = false

function onPointerDown(e: PointerEvent): void {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  startX = e.clientX
  startY = e.clientY
  moved = false
  dragging.value = true
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) moved = true
  ;(e.currentTarget as HTMLElement).style.transform = `translate(${dx}px, ${dy}px)`
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  ;(e.currentTarget as HTMLElement).style.transform = ''
  ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  // 拖过阈值 = 一次「投递」动作，落点由父层判定（命中导航项则换页，否则仍按上图处理）；
  // 未过阈值 = 点击，直接切换图层。
  if (moved) emit('dragend', { x: e.clientX, y: e.clientY })
  else emit('toggle')
}
</script>

<template>
  <button
    type="button"
    class="task-result-chip"
    :class="{ dragging, active: props.active }"
    :style="{ '--chip-color': props.color }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="dragging = false"
  >
    <span class="dot" />
    <span class="label">{{ props.label }}</span>
    <span class="hint">{{ props.active ? '再拖撤下' : '拖到地图上图' }}</span>
  </button>
</template>

<style scoped>
.task-result-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--chip-color);

  /* 胶囊形：半径取 999px 随高度自适应，属几何形状，不走四档 token */
  border-radius: 999px;
  background: var(--GCS-bg-panel-translucent);
  cursor: grab;
  touch-action: none;
  font-size: 12px;
  color: var(--GCS-text-primary);
  box-shadow: var(--GCS-shadow-sm);
}

.task-result-chip.dragging {
  cursor: grabbing;
  z-index: var(--GCS-z-panel-float, 300);
  box-shadow: var(--GCS-shadow-float);
}

.task-result-chip.active {
  background: color-mix(in srgb, var(--chip-color) 16%, var(--GCS-bg-panel));
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: var(--GCS-radius-round);
  background: var(--chip-color);
  flex: none;
}

.label {
  font-weight: 600;
}

.hint {
  color: var(--GCS-text-secondary);
  font-size: var(--GCS-font-size-xs);
}
</style>
