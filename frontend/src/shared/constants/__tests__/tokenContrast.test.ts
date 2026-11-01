import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PORT_FEATURE_COLOR } from '../colors'

const HERE = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(HERE, '../../../style.css'), 'utf8')

function block(selector: RegExp): string {
  const match = css.match(selector)
  if (!match?.[1]) throw new Error(`未找到 token 块：${selector}`)
  return match[1]
}

const root = block(/:root\s*\{([\s\S]*?)\n\}/)
const dark = block(/:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)

function token(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
  if (!match?.[1]) throw new Error(`未找到 token：${name}`)
  return match[1].trim()
}

function rgb(value: string): [number, number, number] {
  if (value.startsWith('#')) {
    const hex = value.slice(1)
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
  }
  const nums = value
    .match(/\d+(?:\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number)
  if (!nums || nums.length < 3) throw new Error(`无法解析颜色：${value}`)
  return nums as [number, number, number]
}

function luminance(color: string): number {
  const channel = (raw: number) => {
    const v = raw / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = rgb(color).map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function expectAA(fgToken: string, bgToken: string, source = root): void {
  const ratio = contrast(token(source, fgToken), token(source, bgToken))
  expect(ratio, `${fgToken} on ${bgToken} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
}

describe('文本 token 对比度（WCAG AA）', () => {
  it('亮色 error 与 muted 在常用底色上 ≥4.5:1', () => {
    expectAA('--GCS-color-error', '--GCS-bg-panel')
    for (const bg of [
      '--GCS-bg-panel',
      '--GCS-bg-container',
      '--GCS-bg-hover',
      '--GCS-bg-active',
    ]) {
      expectAA('--GCS-text-muted', bg)
    }
  })

  it('暗色 muted 在面板与浮层上 ≥4.5:1', () => {
    expectAA('--GCS-text-muted', '--GCS-bg-panel', dark)
    expectAA('--GCS-text-muted', '--GCS-bg-elevated', dark)
  })

  it('亮色主色承载反白文字 ≥4.5:1', () => {
    expectAA('--GCS-text-inverse', '--GCS-color-primary')
    expectAA('--GCS-text-inverse', '--GCS-color-primary-hover')
  })

  it('渲染色副本与 CSS 主色同值（改一处必红）', () => {
    expect(rgb(PORT_FEATURE_COLOR)).toEqual(rgb(token(root, '--GCS-color-primary')))
  })

  it('error 与 danger 仍是两枚不同色值（保留语义分工）', () => {
    expect(token(root, '--GCS-color-error')).not.toBe(token(root, '--GCS-color-danger'))
  })
})
