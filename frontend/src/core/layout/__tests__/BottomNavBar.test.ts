// BottomNavBar 三档位响应式测试（2026-08-09 类型补全后新增——档位逻辑此前零覆盖）
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPush = vi.fn()
const { mockPreloadCesium } = vi.hoisted(() => ({ mockPreloadCesium: vi.fn() }))

vi.mock('../../map/renderers', () => ({ preloadCesium: mockPreloadCesium }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/' }),
  useRouter: () => ({
    push: mockPush,
    // 供 BottomNavBar 的 3D 意图预取判定：只有 3D 路由（浸没/航线）才预取
    resolve: (p: string) => ({
      path: p,
      meta: { engine: p === '/flood-analysis' || p === '/route-analysis' ? '3d' : '2d' },
    }),
  }),
}))

import BottomNavBar from '../components/BottomNavBar.vue'
import { registerNavItems } from '../navConfig'

/** 模拟视口宽度并触发 useGCS 的 resize 防抖 */
async function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true })
  window.dispatchEvent(new Event('resize'))
  // useGCS 的 resize 防抖 150ms
  await new Promise((r) => setTimeout(r, 200))
}

/** 渲染后提取按钮文本（NavButton 与 GCSButton 的 label+icon 拼接） */
function buttonLabels(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll('.GCS-button')
    .map((b) => b.text().replace(/\s+/g, ''))
    .filter((t) => t.length > 0)
}

/** 断言按钮文本包含子串 */
function hasLabel(labels: string[], label: string): boolean {
  return labels.some((l) => l.includes(label))
}

describe('BottomNavBar 三档位', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockPreloadCesium.mockReset()
    registerNavItems([
      { type: 'home', label: '首页', icon: '⌂', path: '/', disabled: false },
      { type: 'business', label: '预测', icon: '📊', path: '/forecast', disabled: false },
      { type: 'business', label: '浸没', icon: '≈', path: '/flood-analysis', disabled: false },
      { type: 'business', label: '选址', icon: '◎', path: '/site-suitability', disabled: false },
      { type: 'business', label: '航线', icon: '🚢', path: '/route-analysis', disabled: true },
      { type: 'profile', label: '个人中心', icon: '👤', path: '/profile', disabled: false },
    ])
  })

  // 自动卸载：半圆 Teleport 到 body，直接清空 body 会让 teleport 的锚点失联（insertBefore null）
  enableAutoUnmount(afterEach)

  it('档位 1（≥960px）：6 键——首页+4 业务+个人中心，无菜单键', async () => {
    await setViewport(1200)
    const wrapper = mount(BottomNavBar)
    const labels = buttonLabels(wrapper)
    expect(labels).toHaveLength(6)
    expect(hasLabel(labels, '首页')).toBe(true)
    expect(hasLabel(labels, '选址')).toBe(true)
    expect(hasLabel(labels, '航线')).toBe(true)
    expect(hasLabel(labels, '个人中心')).toBe(true)
    expect(hasLabel(labels, '菜单')).toBe(false)
  })

  // 抽屉退役（b2）：平板档由下半屏控制台承接参数，导航只留 6 个入口，不再有菜单键
  it('档位 2（640~959px）：6 键——与控制台并存，无菜单键', async () => {
    await setViewport(800)
    const wrapper = mount(BottomNavBar)
    const labels = buttonLabels(wrapper)
    expect(labels).toHaveLength(6)
    expect(hasLabel(labels, '选址')).toBe(true)
    expect(hasLabel(labels, '菜单')).toBe(false)
  })

  it('档位 3（<640px）：3 键——首页/＋/个人中心，业务收进半圆', async () => {
    await setViewport(375)
    const wrapper = mount(BottomNavBar)
    const labels = buttonLabels(wrapper)
    expect(labels).toHaveLength(3)
    expect(hasLabel(labels, '首页')).toBe(true)
    expect(hasLabel(labels, '个人中心')).toBe(true)
    expect(wrapper.find('.dock-plus-wrap').exists()).toBe(true)
    expect(hasLabel(labels, '菜单')).toBe(false)
    expect(hasLabel(labels, '选址')).toBe(false)
  })

  it('档位 1/2 点 ＋ 不出现半圆（该形态只属最小视口）', async () => {
    await setViewport(1200)
    const wrapper = mount(BottomNavBar)
    expect(wrapper.find('.dock-fan').exists()).toBe(false)
    expect(wrapper.find('.dock-plus-wrap').exists()).toBe(false)
  })

  it('点击导航项调用 router.push', async () => {
    await setViewport(1200)
    const wrapper = mount(BottomNavBar)
    const siteBtn = wrapper.findAll('.GCS-button').find((b) => b.text().includes('选址'))!
    await siteBtn.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/site-suitability')
  })

  it('禁用项点击不跳转', async () => {
    await setViewport(1200)
    const wrapper = mount(BottomNavBar)
    const routeBtn = wrapper.findAll('.GCS-button').find((b) => b.text().includes('航线'))!
    await routeBtn.trigger('click')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('悬停 3D 导航项触发 Cesium 意图预取（治 z037：点进去要等 10s+）', async () => {
    await setViewport(1200)
    const wrapper = mount(BottomNavBar)
    // mouseenter 不冒泡：必须打在外层包裹元素（真实悬停的作用域），不能打内层按钮
    const floodWrap = wrapper.findAll('.nav-button-wrap').find((w) => w.text().includes('浸没'))!
    await floodWrap.trigger('mouseenter')
    expect(mockPreloadCesium).toHaveBeenCalledTimes(1)
    // 键盘可达性同等对待（focusin 会冒泡到包裹层）
    await floodWrap.find('.GCS-button').trigger('focusin')
    expect(mockPreloadCesium).toHaveBeenCalledTimes(2)
  })

  it('悬停 2D 导航项不预取（不抢首屏带宽）', async () => {
    await setViewport(1200)
    const wrapper = mount(BottomNavBar)
    const siteWrap = wrapper.findAll('.nav-button-wrap').find((w) => w.text().includes('选址'))!
    await siteWrap.trigger('mouseenter')
    expect(mockPreloadCesium).not.toHaveBeenCalled()
  })

  it('禁用项悬停不预取', async () => {
    await setViewport(1200)
    const wrapper = mount(BottomNavBar)
    const routeWrap = wrapper.findAll('.nav-button-wrap').find((w) => w.text().includes('航线'))!
    await routeWrap.trigger('mouseenter')
    expect(mockPreloadCesium).not.toHaveBeenCalled()
  })

  it('档位 3 半圆展开时给 body 挂 dock-fan-open，收起/卸载都摘掉', async () => {
    await setViewport(375)
    const wrapper = mount(BottomNavBar)
    expect(document.body.classList.contains('dock-fan-open')).toBe(false)

    await wrapper.find('.dock-plus-wrap .GCS-button').trigger('click')
    expect(document.body.classList.contains('dock-fan-open')).toBe(true)

    await wrapper.find('.dock-plus-wrap .GCS-button').trigger('click')
    expect(document.body.classList.contains('dock-fan-open')).toBe(false)

    await wrapper.find('.dock-plus-wrap .GCS-button').trigger('click')
    wrapper.unmount()
    expect(document.body.classList.contains('dock-fan-open')).toBe(false)
  })

  it('档位 3 点 ＋ 展开半圆：只有 4 个业务项，没有「更多」', async () => {
    await setViewport(375)
    const wrapper = mount(BottomNavBar)
    await wrapper.find('.dock-plus-wrap .GCS-button').trigger('click')
    await nextTick()

    const fan = document.body.querySelector('.dock-fan')
    expect(fan).not.toBeNull()
    const labels = Array.from(document.body.querySelectorAll('.dock-fan .GCS-button')).map((b) =>
      (b.textContent ?? '').replace(/\s+/g, '')
    )
    expect(labels.some((l) => l.includes('预测'))).toBe(true)
    expect(labels.some((l) => l.includes('选址'))).toBe(true)
    expect(labels.some((l) => l.includes('浸没'))).toBe(true)
    expect(labels).toHaveLength(4) // 夹具只注册了 4 个业务项
    expect(labels.some((l) => l.includes('更多'))).toBe(false)
  })

  it('半圆里点业务项：跳该路由并收起', async () => {
    await setViewport(375)
    const wrapper = mount(BottomNavBar)
    await wrapper.find('.dock-plus-wrap .GCS-button').trigger('click')
    await nextTick()

    const btn = Array.from(document.body.querySelectorAll('.dock-fan .GCS-button')).find((b) =>
      (b.textContent ?? '').includes('选址')
    ) as HTMLElement
    btn.click()
    await nextTick()

    expect(mockPush).toHaveBeenCalledWith('/site-suitability')
    expect(document.body.querySelector('.dock-fan')).toBeNull()
  })

  it('半圆外按下即收起（不挡地图操作）', async () => {
    await setViewport(375)
    const wrapper = mount(BottomNavBar)
    await wrapper.find('.dock-plus-wrap .GCS-button').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.dock-fan')).not.toBeNull()

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()

    expect(document.body.querySelector('.dock-fan')).toBeNull()
  })
})
