<script setup lang="ts">
/**
 * MobileDrawer - 业务面板侧滑抽屉（仅抽屉模式即窄屏渲染）
 * 复用 AppLayout 注入的 left/right slot（Vue 插槽）内容，内部 GCSPanel 的绝对定位
 * 由 style.css 全局规则强制改为正常流布局。role="dialog" + aria-modal，Esc/遮罩关闭。
 */
import { ref } from 'vue'

import { useEscapeClose, useFocusTrap } from '@/shared'

interface Props {
  open: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

useEscapeClose(
  () => emit('close'),
  () => props.open
)

/* ===== 键盘焦点 =====
 * 这层自称 role="dialog" + aria-modal="true"：对读屏意味着「外面是惰性的」，
 * 可键盘此前 Tab 到第 28 个就漏到 body、再进到遮罩背后的控件——声明与实际不符。
 * 焦点进入 / 循环 / 回焦三件事统一走 useFocusTrap。 */
const rootRef = ref<HTMLElement | null>(null)
const { onKeydown } = useFocusTrap(rootRef, () => props.open)
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="open"
        ref="rootRef"
        class="GCS-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="业务面板"
        @keydown="onKeydown"
      >
        <div class="GCS-drawer__backdrop" @click="emit('close')"></div>
        <aside class="GCS-drawer__sheet">
          <header class="GCS-drawer__header">
            <span>业务面板</span>
            <button
              type="button"
              class="GCS-drawer__close"
              aria-label="关闭面板"
              @click="emit('close')"
            >
              ✕
            </button>
          </header>
          <div class="GCS-drawer__body">
            <slot />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
