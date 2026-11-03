import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SliderNaked from '../SliderNaked.vue'

describe('SliderNaked 裸露滑块', () => {
  it('挂载即渲染 range，值/极值/步进直通属性（没有点击展开这一步）', () => {
    const w = mount(SliderNaked, { props: { value: 2035, min: 2027, max: 2050, step: 1 } })
    const input = w.find('input[type="range"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('2035')
    expect(input.attributes('min')).toBe('2027')
    expect(input.attributes('max')).toBe('2050')
    expect(input.attributes('step')).toBe('1')
  })

  it('input 事件吐 number（不是数组、不是字符串）', async () => {
    const w = mount(SliderNaked, { props: { value: 5, min: 0, max: 10, step: 0.1 } })
    await w.find('input[type="range"]').setValue('7.5')
    expect(w.emitted('update:value')?.[0]).toEqual([7.5])
  })

  it('label + suffix 拼出行内数值；轨道填充比例随值变化', () => {
    const w = mount(SliderNaked, {
      props: { value: 2.5, min: 0, max: 10, suffix: 'm', label: '水位' },
    })
    expect(w.find('.slider-naked__label').text()).toBe('水位')
    expect(w.find('.slider-naked__value').text()).toBe('2.5m')
    expect(w.find('input').attributes('style')).toContain('--GCS-slider-fill: 25%')
  })

  it('刻度可点：点击发对应值，当前档高亮', async () => {
    const w = mount(SliderNaked, {
      props: { value: 5, min: 0, max: 10, ticks: [0, 2.5, 5, 7.5, 10] },
    })
    const ticks = w.findAll('.slider-naked__tick')
    expect(ticks).toHaveLength(5)
    expect(ticks[2].classes()).toContain('is-active')
    await ticks[3].trigger('click')
    expect(w.emitted('update:value')?.[0]).toEqual([7.5])
  })

  it('disabled：滑块与刻度都不可交互', async () => {
    const w = mount(SliderNaked, {
      props: { value: 1, min: 0, max: 10, ticks: [0, 5, 10], disabled: true },
    })
    expect(w.find('input').attributes('disabled')).toBeDefined()
    await w.findAll('.slider-naked__tick')[1].trigger('click')
    expect(w.emitted('update:value')).toBeUndefined()
  })

  it('label 为空时用 ariaLabel 兜底无障碍名', () => {
    const w = mount(SliderNaked, {
      props: { value: 1, min: 0, max: 10, ariaLabel: '分析年份' },
    })
    expect(w.find('input').attributes('aria-label')).toBe('分析年份')
  })
})
