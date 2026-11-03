import { onMounted, onUnmounted } from 'vue'

/**
 * 浮层 Esc 关闭（侧滑抽屉 / dock 半圆共用）。
 *
 * 常驻监听 + `when` 判定，而不是开合时挂摘：浮层开合很频繁，挂摘容易在「开着的时候
 * 组件被卸载」这条路径上漏摘；把判定放进处理函数，注册与注销就各只有一个出口。
 */
export function useEscapeClose(close: () => void, when?: () => boolean): void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    if (when && !when()) return
    close()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}
