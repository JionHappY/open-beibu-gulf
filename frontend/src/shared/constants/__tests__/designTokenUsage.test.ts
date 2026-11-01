import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'postcss'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../../..')

function readCss(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8')
}

function sfcStyle(rel: string): string {
  const style = readCss(rel).match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1]
  if (!style) throw new Error(`${rel} 没有 style 块`)
  return style
}

function declarations(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  parse(css).walkRules((rule) => {
    if (rule.selector !== selector) return
    rule.walkDecls((decl) => {
      out[decl.prop] = decl.value.trim()
    })
  })
  return out
}

describe('阴影与反色边走主题 token', () => {
  it('气泡阴影使用 --GCS-shadow-sm', () => {
    const decl = declarations(readCss('core/map/components/bubble.css'), '.map-bubble')
    expect(decl['box-shadow']).toBe('var(--GCS-shadow-sm)')
  })

  it('滑块拇指边框/阴影使用主题 token（亮暗自动换值）', () => {
    const css = sfcStyle('shared/components/SliderSelectCard.vue')
    for (const selector of ['.ssc-slider::-webkit-slider-thumb', '.ssc-slider::-moz-range-thumb']) {
      const decl = declarations(css, selector)
      expect(decl.border, selector).toBe('2px solid var(--GCS-bg-panel)')
      expect(decl['box-shadow'], selector).toBe('var(--GCS-shadow-sm)')
    }
  })
})

describe('输入框键盘焦点环', () => {
  it.each([
    ['business/route-analysis/components/RouteControlPanel.vue', '.poi-search:focus-visible'],
    ['views/LoginPanel.vue', '.form-input:focus-visible'],
  ])('%s 的 %s 使用统一 focus 环', (rel, selector) => {
    const decl = declarations(sfcStyle(rel), selector)
    expect(decl.outline, selector).toBe('2px solid var(--GCS-border-focus)')
    expect(decl['outline-offset'], selector).toBe('2px')
  })
})

describe('禁用态统一到文字 token', () => {
  it('gcs-chip 禁用不再用 opacity', () => {
    const decl = declarations(readCss('style.css'), '.gcs-chip:disabled')
    expect(decl.color).toBe('var(--GCS-text-disabled)')
    expect(decl.cursor).toBe('not-allowed')
    expect(decl.opacity).toBeUndefined()
  })

  it('登录提交禁用态使用容器底与 disabled 文字', () => {
    const decl = declarations(sfcStyle('views/LoginPanel.vue'), '.submit-btn:disabled')
    expect(decl.background).toBe('var(--GCS-bg-container)')
    expect(decl.color).toBe('var(--GCS-text-disabled)')
    expect(decl.cursor).toBe('not-allowed')
    expect(decl.opacity).toBeUndefined()
  })

  it('航线主按钮禁用态回到中性底/边框', () => {
    const decl = declarations(
      sfcStyle('business/route-analysis/components/RouteControlPanel.vue'),
      '.route-btn.primary:disabled'
    )
    expect(decl.background).toBe('var(--GCS-bg-container)')
    expect(decl['border-color']).toBe('var(--GCS-border-default)')
    expect(decl.color).toBe('var(--GCS-text-disabled)')
  })

  it('GCSButton 样式层不再用 opacity 表示禁用', () => {
    const decl = declarations(
      sfcStyle('core/layout/components/GCSButton.vue'),
      '.GCS-button:disabled'
    )
    expect(decl.cursor).toBe('not-allowed')
    expect(decl.opacity).toBeUndefined()
  })
})
