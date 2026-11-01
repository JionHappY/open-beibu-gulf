<script setup lang="ts">
/**
 * AppIcon — 命名图标 → 内联 SVG（描边 currentColor）。
 * 名表见 `icons.ts`（唯一权威源）；未登记名渲染空 svg，不回退字符——
 * 回退会让 emoji/Unicode 混用重新长回来，混用才是本组件要治的病。
 *
 * 尺寸默认 1em：跟随宿主元素的 font-size（导航钮走 GCSButton 的 0.85em，
 * 预测指标钮走 .ind-icon 的 cell 派生字号），不另设一套图标尺寸档位。
 */
import { computed } from 'vue'

import { ICON_PATHS, type IconName } from './icons'

const props = defineProps<{ name: IconName }>()

const path = computed(() => ICON_PATHS[props.name])
</script>

<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-if="path" :d="path" />
  </svg>
</template>

<style scoped>
.app-icon {
  display: inline-block;
  flex: none;
  vertical-align: -0.125em;
}
</style>
