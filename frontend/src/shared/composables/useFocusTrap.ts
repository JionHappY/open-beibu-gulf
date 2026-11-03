/**
 * useFocusTrap - 浮层（半圆 / 抽屉）的键盘焦点管理
 *
 * 三件事，缺一都算「声明与行为不符」：
 *   ① 展开时焦点交给浮层内第一个可聚焦元素——否则焦点留在触发键上，
 *      第一次 Tab 又绕回去，读屏用户不知道浮层已经开了；
 *   ② Tab / Shift+Tab 在浮层内首尾相扣——浮层带遮罩时，外面被盖住、鼠标点不到，
 *      键盘却还能走进去（看不见的按钮能按、看得见的按不了）；
 *   ③ 关闭时把焦点还给触发键——否则焦点掉到 body，下一次 Tab 从页头重新开始。
 *
 * 只在 `offsetParent !== null` 的元素间循环：display:none 的折叠面板内部控件
 * 不可见，不能被纳入 Tab 序列。
 */
import { nextTick, watch, type Ref } from 'vue'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface FocusTrap {
  /** 绑到浮层根节点的 @keydown */
  onKeydown: (e: KeyboardEvent) => void
  /** 浮层因跳转而非用户关闭时调用：跳过回焦，避免把焦点抢回旧页面的触发键 */
  release: () => void
}

export function useFocusTrap(root: Ref<HTMLElement | null>, isOpen: () => boolean): FocusTrap {
  let lastFocused: HTMLElement | null = null
  let skipRestore = false

  function focusables(): HTMLElement[] {
    const el = root.value
    if (!el) return []
    return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => node.offsetParent !== null
    )
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return
    const list = focusables()
    if (!list.length) return
    const first = list[0]!
    const last = list[list.length - 1]!
    const active = document.activeElement as HTMLElement | null
    const inside = !!active && !!root.value?.contains(active)
    if (e.shiftKey && (!inside || active === first)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (!inside || active === last)) {
      e.preventDefault()
      first.focus()
    }
  }

  watch(isOpen, async (open) => {
    if (!open) {
      if (!skipRestore) lastFocused?.focus()
      lastFocused = null
      skipRestore = false
      return
    }
    lastFocused = document.activeElement as HTMLElement | null
    await nextTick()
    focusables()[0]?.focus()
  })

  return { onKeydown, release: () => (skipRestore = true) }
}
