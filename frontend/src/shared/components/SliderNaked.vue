<script setup lang="ts">
/**
 * 裸露滑块：没有「未选中的信息」可言时，滑块直接摊开，不需要先点一下再拖。
 *
 * 与 SliderSelectCard 的分工（判据见 docs：这个参数有没有「待选中」状态）：
 * - 有选中语义（准则卡、站点卡）→ SliderSelectCard：默认只读，点开才编辑；
 * - 无选中语义（年份、水位）→ 本组件：常驻可见，拖了就生效。
 *
 * 为什么单独一件而不是把 SliderSelectCard 加个 boolean：卡片的三态机在裸露档全用不上，
 * 塞进去等于让每个消费方都背一份四态分支；两件各自单一职责，消费方按语义二选一。
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 当前值（受控） */
    value: number
    min: number
    max: number
    step?: number
    /** 行首说明，如「当前年份」 */
    label?: string
    /** 数值后缀，如「m」 */
    suffix?: string
    /** 刻度值（可点，等距由调用方给） */
    ticks?: number[]
    disabled?: boolean
    /** 滑块无障碍名（label 为空时必填） */
    ariaLabel?: string
  }>(),
  { step: 1, label: '', suffix: '', ticks: () => [], disabled: false, ariaLabel: '' }
)

const emit = defineEmits<{
  'update:value': [value: number]
}>()

const displayValue = computed(() => `${props.value}${props.suffix}`)

/** 轨道填充比例：没有它滑块是纯灰条，看不出当前落在区间哪一段 */
const fillCss = computed(() => {
  const span = props.max - props.min
  const pct = span <= 0 ? 0 : ((props.value - props.min) / span) * 100
  return { '--GCS-slider-fill': `${Math.min(100, Math.max(0, pct))}%` }
})

function onInput(e: Event): void {
  emit('update:value', Number((e.target as HTMLInputElement).value))
}

function pickTick(t: number): void {
  if (props.disabled) return
  emit('update:value', t)
}
</script>

<template>
  <div class="slider-naked" :class="{ 'is-disabled': disabled }">
    <div class="slider-naked__head">
      <span v-if="label" class="slider-naked__label">{{ label }}</span>
      <span class="slider-naked__value">{{ displayValue }}</span>
    </div>
    <input
      class="slider-naked__input"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="value"
      :disabled="disabled"
      :aria-label="ariaLabel || label || undefined"
      :style="fillCss"
      @input="onInput"
    />
    <div v-if="ticks.length" class="slider-naked__ticks">
      <button
        v-for="t in ticks"
        :key="t"
        type="button"
        class="slider-naked__tick"
        :class="{ 'is-active': t === value }"
        :disabled="disabled"
        @click="pickTick(t)"
      >
        {{ t }}{{ suffix }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.slider-naked {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--GCS-text-secondary);
}

.slider-naked__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.slider-naked__label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slider-naked__value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--GCS-color-primary);
  white-space: nowrap;
}

.slider-naked__input {
  appearance: none;
  width: 100%;
  min-width: 0;
  height: var(--GCS-slider-thumb-size);
  margin: 0;
  background: transparent;
  cursor: pointer;
}

/* 轨道单独画：input 本体透明，拇指才不会被 14px 高的色条吞掉 */
.slider-naked__input::-webkit-slider-runnable-track {
  /* 轨道画成细线而不是整块色条：轨道高度取拇指高（拇指才自动居中，
     无需负 margin —— 全仓 stylelint 禁负值），再用渐变只填中间 4px 那一带 */
  height: var(--GCS-slider-thumb-size);
  border-radius: 2px;
  background-image: linear-gradient(
    to right,
    var(--GCS-color-primary) 0%,
    var(--GCS-color-primary) var(--GCS-slider-fill, 0%),
    var(--GCS-border-default) var(--GCS-slider-fill, 0%),
    var(--GCS-border-default) 100%
  );
  background-size: 100% 4px;
  background-position: center;
  background-repeat: no-repeat;
}

.slider-naked__input::-webkit-slider-thumb {
  appearance: none;
  width: var(--GCS-slider-thumb-size);
  height: var(--GCS-slider-thumb-size);
  border-radius: var(--GCS-radius-round);
  background: var(--GCS-color-primary);
  border: 2px solid var(--GCS-bg-panel);
  box-shadow: var(--GCS-shadow-sm);
  cursor: grab;
}

/* Firefox 用 range-progress 直接画已选段，不需要渐变 */
.slider-naked__input::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: var(--GCS-border-default);
}

.slider-naked__input::-moz-range-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--GCS-color-primary);
}

.slider-naked__input::-moz-range-thumb {
  width: var(--GCS-slider-thumb-size);
  height: var(--GCS-slider-thumb-size);
  border-radius: var(--GCS-radius-round);
  background: var(--GCS-color-primary);
  border: 2px solid var(--GCS-bg-panel);
  cursor: grab;
}

.slider-naked__input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.slider-naked__ticks {
  display: flex;
  justify-content: space-between;
  gap: 2px;
}

.slider-naked__tick {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  border: none;
  background: none;
  color: var(--GCS-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.slider-naked__tick.is-active {
  color: var(--GCS-color-primary);
  font-weight: 600;
}

.slider-naked__tick:disabled {
  cursor: not-allowed;
}

.slider-naked.is-disabled .slider-naked__value {
  color: var(--GCS-text-muted);
}
</style>
