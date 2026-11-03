<!-- 预测分析控制面板（4×4）：上半为 4 个指标按钮（三态）+ 情景系数滑块，
     下半为裸露时间轴（挂载即自动播放）+ 情景下拉 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, watch } from 'vue'

import { useSliderFocus } from '@/core'
import {
  AppIcon,
  CANAL_SCENARIO_OPTIONS,
  CONFIRM_DELAY,
  DEFAULT_CONFIDENCE,
  type IconName,
  ROW_HEIGHT_CELL,
  SliderSelectCard,
  showToast,
  useGCS,
} from '@/shared'
import { useForecastStore } from '@/stores'

import { useForecastOrchestrator } from '../composables/useForecastOrchestrator'
import {
  currentTimeToStep,
  monthMaxSteps,
  stepToTime as timelineStepToTime,
  timelineYears,
  yearMarkPosition,
} from '../timeline'

const forecastState = useForecastStore()

// 滑块专注模式（安卓控制中心风格）：拖动滑块时隐藏其他面板，只留本面板
const { beginSliderFocusOnRange, endSliderFocus } = useSliderFocus()

// GCS 尺寸变量：cell8px=0.1cell 面板内边距；cell16px=0.2cell 按钮间距
const { cellPixel, css } = useGCS()
const { cell8px, cell16px } = css
/** 按钮高度：固定行高，系数取自 panelCapacity 的 ROW_HEIGHT_CELL（与容量公式共用同一份比例） */
const btnHeightCss = computed(() => `${cellPixel.value * ROW_HEIGHT_CELL}px`)
/** 字体档位：0.2cell 图标、0.15cell 小字、0.125cell 角标 */
const iconFontSizeCss = computed(() => `${cellPixel.value * 0.2}px`)
const smallFontSizeCss = computed(() => `${cellPixel.value * 0.15}px`)
// CONFIRM_DELAY 两面板共用，统一放 shared/constants/ui

// ===== 三个指标 =====
// cargo/container 为官方真吞吐量热力；activity 为真数据派生「港口吞吐活跃度」指数
//（cargo 基期归一指数，见 tools/forecast/derive-activity.mjs）。berth/traffic 纯合成指标已下架
//（源文件保留标 _provenance），不再有「（模拟）」角标
const INDICATORS = [
  { key: 'cargo', label: '货物', icon: 'cargo' },
  { key: 'container', label: '集装箱', icon: 'container' },
  { key: 'activity', label: '港口吞吐活跃度', icon: 'activity' },
] as const satisfies readonly { key: string; label: string; icon: IconName }[]

/**
 * 第四张卡：同比增速视图（2×2 的第二行右格，自上而下读）。
 * 不是第四个数据指标——后端只有三份序列；增速在折线/柱图上由同一序列的 t 与 t-12 期算，
 * 不发请求、不新增图层，所以它不进 INDICATORS（那个数组决定热力图条目数）。
 */
const GROWTH_CELL = { key: 'growth', label: '同比增速', icon: 'percent' } as const
const CELLS = [...INDICATORS, GROWTH_CELL] as const

// selected 由 store activeIndicator 派生（getter）——
// 快照恢复 restoreState 设置 activeIndicator 后按钮高亮自动一致（原本地双源：恢复非 cargo 时按钮仍亮 cargo）
interface BtnState {
  selected: boolean
  selecting: boolean
}

const INDICATOR_STATES = Object.fromEntries(
  INDICATORS.map((i) => [
    i.key,
    {
      get selected() {
        return forecastState.activeIndicator === i.key
      },
      selecting: false,
    },
  ])
) as Record<string, BtnState>

const btnStates = reactive<Record<string, BtnState>>({
  ...INDICATOR_STATES,
  // 第四格不是数据指标：高亮跟随增速视图开关，任何时候都不进「选择中」滑块态
  growth: {
    get selected() {
      return forecastState.growthMode
    },
    selecting: false,
  },
})

/**
 * 定时器登记处：本组件 4 条链（confirm:指标键 按钮确认 / confidence 置信度防抖 /
 * refresh 刷新防抖 / playback 播放）共用一套「登记 → 撤销 → 卸载清空」。
 * 收口前每条链各自手抄三件套——可空句柄声明、清理前判空、卸载时再抄一遍，
 * 漏一处就是「卸载后仍写 store」，或「同名计时器叠加」把防抖变成串行。
 * 值存撤销闭包而非句柄：timeout 与 interval 的撤销方式在登记处一次选定，清理端
 * 无分派（dup 棘轮：句柄+kind 的分派若在 clearNamedTimer 与卸载钩子各一份即重复）；
 * 卸载钩子内以 `cancel()` 遍历执行——cancel 在 owned-layers 白名单内（在途请求
 * 取消语义，定时器撤销同属取消），钩子不出现非白名单名，也不藏第二份分派。
 */
const timers = new Map<string, () => void>()

/** 撤销并摘登记（未登记即无操作，天然幂等） */
function clearNamedTimer(name: string): void {
  timers.get(name)?.()
  timers.delete(name)
}

/** 覆盖式排程（debounce / 重置语义）：先撤销同名旧定时器，到点先摘登记再执行 */
function scheduleNamedTimer(name: string, delay: number, fn: () => void): void {
  clearNamedTimer(name)
  const handle = setTimeout(() => {
    timers.delete(name)
    fn()
  }, delay)
  timers.set(name, () => clearTimeout(handle))
}

/** 周期定时器（播放）：同样走登记，撤销方式为 clearInterval */
function startNamedInterval(name: string, delay: number, fn: () => void): void {
  clearNamedTimer(name)
  const handle = setInterval(fn, delay)
  timers.set(name, () => clearInterval(handle))
}

/** 所有指标卡退出「选择中」并撤掉各自的确认计时器（切指标 / 切增速视图前统一收口） */
function resetAllCells(): void {
  for (const k of Object.keys(btnStates)) {
    btnStates[k].selecting = false
    clearTimer(k)
  }
}

function toggleBtn(key: string) {
  if (key === GROWTH_CELL.key) {
    resetAllCells()
    forecastState.setGrowthMode(!forecastState.growthMode)
    return
  }
  // 碰任何真指标都退出增速视图：增速是「看这张图的方式」，不是第四个并列指标。
  // 放在分支之前——点「已选中」的那个指标也会走下面 else 分支，同样要退。
  forecastState.setGrowthMode(false)
  const s = btnStates[key]
  if (!s.selected) {
    // 取消其他按钮的 selecting 计时器并复位（selected 已派生，无需直写）
    resetAllCells()
    forecastState.setActiveIndicator(key)
    s.selecting = true
    resetTimer(key)
  } else if (s.selected && !s.selecting) {
    s.selecting = true
    resetTimer(key)
  }
}

function onSliderInput(key: string) {
  resetTimer(key)
}

// 置信度滑块防抖
function onConfidenceSliderInput(key: string, value: string) {
  scheduleNamedTimer('confidence', 300, () => {
    forecastState.setConfidenceThreshold(key, Number(value))
    onSliderInput(key)
  })
}
function confirmBtn(key: string) {
  if (btnStates[key].selecting) {
    btnStates[key].selecting = false
    clearTimer(key)
  }
}
function resetTimer(key: string) {
  scheduleNamedTimer(`confirm:${key}`, CONFIRM_DELAY, () => confirmBtn(key))
}
function clearTimer(key: string) {
  clearNamedTimer(`confirm:${key}`)
}
function confirmAll() {
  Object.keys(btnStates).forEach((k) => {
    if (btnStates[k].selecting) confirmBtn(k)
  })
}
function handleGlobalClick(e: Event) {
  const target = e.target as HTMLElement
  if (!target.closest('.forecast-ctrl')) confirmAll()
}

function getConf(key: string) {
  return forecastState.confidenceThresholds[key] ?? DEFAULT_CONFIDENCE
}

// ===== 运河情景（F4）：仅 cargo 有文献锚点，其余指标禁用非基线档 =====
const scenarioDisabled = computed(() => forecastState.activeIndicator !== 'cargo')
function pickScenario(id: string) {
  if (scenarioDisabled.value) return
  if (forecastState.canalScenario !== id) forecastState.setCanalScenario(id)
}

// ===== v4-S3：请求归属上移——"用户改了什么"由本面板发起 =====
// 三路共享事务的编排器由页面 provide（AbortController 单实例），本面板 inject 后调用；
// 页面只保留"渲染器就绪"这一次渲染侧初始化触发（见 ForecastPage.vue）。
const { doForecastUpdate } = useForecastOrchestrator()

/** 距最后一次操作 300ms 统一刷新：合并 indicator/time/confidence/运河情景 的连续变化，避免双触发 */
const REFRESH_DEBOUNCE_MS = 300
watch(
  () => [
    forecastState.activeIndicator,
    forecastState.currentTime,
    forecastState.confidenceThresholds[forecastState.activeIndicator],
    forecastState.canalScenario,
  ],
  () => {
    scheduleNamedTimer('refresh', REFRESH_DEBOUNCE_MS, () => void doForecastUpdate())
  }
)

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
  document.addEventListener('keydown', onKeydown)
  hintOnce()
})
onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
  document.removeEventListener('keydown', onKeydown)
  // 卸载清理一次收口：按钮确认计时器 / 置信度防抖（卸载后不再写 store）/
  // 刷新防抖（v4-S3：与页面 cancelAll 互补，这边防的是"还没发出去"的那一次）/ 播放。
  // cancel 在 owned-layers 白名单内（在途请求取消语义，定时器撤销同属取消）；
  // 撤销方式（clearTimeout/clearInterval）在登记处闭包内一次选定，钩子零分派；
  // 不调 timers.clear()（clear 不在白名单）——句柄已全撤销，登记表随实例回收。
  for (const cancel of timers.values()) cancel()
  endSliderFocus()
})

// ===== 时间滑块 =====
// 步数上限收口 ../timeline（D21-1：两条公式原在此手抄——timeline 同款函数即
// H-3 越界事故的收口正本，面板改调函数后手抄清零）
const maxSteps = computed(() => monthMaxSteps())

// 步数换算收口 ../timeline（月步；历史快照的无月份串由 m 缺省兜 1，防 NaN——审查 H-3）
const currentStep = computed(() => currentTimeToStep(forecastState.currentTime))

function stepToTime(step: number) {
  return timelineStepToTime(step)
}

/** 时间轴滑块输入（SliderSelectCard 已抽出 number，无需重复解析事件对象） */
function onTimelineSliderInput(value: number) {
  forecastState.setCurrentTime(stepToTime(value))
}

/** 裸露 range 的 input 事件 → 同上（原生控件给的是字符串） */
function onTimeRangeInput(e: Event) {
  onTimelineSliderInput(Number((e.target as HTMLInputElement).value))
}

/** 刻度年份（起止+中点）与标签：年份域单源在 ../timeline，位置公式同源（不手抄年数差） */
const YEAR_MARKS = timelineYears().map((year) => ({ year, label: `${year}.1` }))

function jumpToYear(year: number) {
  forecastState.setCurrentTime(`${year}-01`)
}

const displayTime = computed(() => {
  const t = forecastState.currentTime
  return t.replace('-', '年') + '月'
})

/** 气泡跟随滑块的点：按当前步在轨道上的百分比定位（首尾各留半个拇指宽由 translateX(-50%) 抵） */
const bubblePosCss = computed(() => {
  const max = maxSteps.value
  if (max <= 0) return '0%'
  const pct = (currentStep.value / max) * 100
  return `${Math.min(100, Math.max(0, pct))}%`
})

// ===== 播放 =====
function togglePlay() {
  forecastState.setIsPlaying(!forecastState.isPlaying)
  if (forecastState.isPlaying) startPlayback()
  else stopPlayback()
}
function startPlayback() {
  startNamedInterval('playback', forecastState.playSpeed, () => {
    // !Number.isFinite 防御：currentTime 异常（坏快照/历史脏数据）时 currentStep 为 NaN，
    // NaN >= N 恒 false 曾穿透守卫死循环（H-3）——异常值直接停播而非永续推进
    if (
      !forecastState.isPlaying ||
      !Number.isFinite(currentStep.value) ||
      currentStep.value >= maxSteps.value
    ) {
      forecastState.setIsPlaying(false)
      stopPlayback()
      return
    }
    // 后台标签页不推进：推一帧就发一次 forecast 请求，切走后继续推等于空烧后端
    // （浏览器只把 setInterval 节流到秒级，不会停）。回到前台自动续上，位置不丢。
    if (document.hidden) return
    forecastState.setCurrentTime(stepToTime(currentStep.value + 1))
  })
}
function stopPlayback() {
  clearNamedTimer('playback')
}

/**
 * 默认自动播放（用户定稿：撤掉 ▶ 键）：进页面即推时间轴，推到末帧停。
 * 不回绕——每推一帧发一次 forecast 请求，回绕会无限打 API（后端有"请求过于频繁"限流）。
 * 想再看一遍：空格重播。
 */
let autoStarted = false
watch(
  maxSteps,
  (n) => {
    if (autoStarted || n <= 0) return
    autoStarted = true
    forecastState.setIsPlaying(true)
    startPlayback()
  },
  { immediate: true }
)

/** 空格 = 播放/暂停；在输入框/可编辑区里不劫持（避免影响 slider 之外的键入） */
function onKeydown(e: KeyboardEvent) {
  if (e.code !== 'Space') return
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  e.preventDefault()
  togglePlay()
}

/**
 * 一次性提示（走 toast，不常驻占位）：
 * ①撤掉 ▶ 键后怎么控制播放；②热力点的空间分布是示意性插值（原常驻脚注，W17 口径不减，
 * 只是不再占面板位置）。
 */
function hintOnce() {
  if (sessionStorage.getItem('gcs.forecast.hint')) return
  sessionStorage.setItem('gcs.forecast.hint', '1')
  showToast('空格键 播放/暂停')
  showToast('热力点空间分布为示意性插值，非实测点位')
}
</script>

<template>
  <div class="forecast-ctrl">
    <!-- ===== 上半：4 个指标按钮（2×2）===== -->
    <div class="btn-grid" data-overflow-exit="scroll">
      <div
        v-for="ind in CELLS"
        :key="ind.key"
        :class="[
          'btn-cell',
          { sel: btnStates[ind.key].selected, ing: btnStates[ind.key].selecting },
        ]"
        @mousedown.stop
      >
        <!-- 三态选择卡片（公共组件 SliderSelectCard，与选址统一） -->
        <SliderSelectCard
          :selecting="btnStates[ind.key].selecting"
          :selected="btnStates[ind.key].selected"
          :label="ind.label"
          :status-text="ind.key === GROWTH_CELL.key ? '' : `×${getConf(ind.key).toFixed(2)}`"
          :slider-value="
            btnStates[ind.key].selecting && ind.key !== GROWTH_CELL.key ? getConf(ind.key) : null
          "
          :slider-min="0.8"
          :slider-max="1.2"
          :slider-step="0.05"
          @toggle="toggleBtn(ind.key)"
          @update:slider-value="(v) => onConfidenceSliderInput(ind.key, String(v))"
        >
          <template #icon>
            <span class="ind-icon"><AppIcon :name="ind.icon" /></span>
          </template>
        </SliderSelectCard>
      </div>
    </div>

    <!-- ===== 运河情景（仅 cargo 可选）===== -->
    <div
      class="scenario-row"
      :class="{ off: scenarioDisabled }"
      title="锚点出处见论文情景章；三港分摊默认按 2022 年现状吞吐量结构（钦 1.74/防 1.54/北 0.44 亿吨）"
    >
      <span class="scenario-label">运河情景</span>
      <div class="scenario-chips">
        <button
          v-for="opt in CANAL_SCENARIO_OPTIONS"
          :key="opt.id"
          type="button"
          class="scenario-chip gcs-chip"
          :class="{ sel: forecastState.canalScenario === opt.id }"
          :disabled="scenarioDisabled && opt.id !== 'baseline'"
          @click="pickScenario(opt.id)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- ===== 下半：时间轴（裸露滑块；时间只在滑动时以气泡跟手显示，不常驻占位） ===== -->
    <div class="time-section">
      <div class="time-grid">
        <div class="time-card" :style="{ '--pos': bubblePosCss }">
          <span class="time-bubble">{{ displayTime }}</span>
          <input
            class="time-range"
            type="range"
            min="0"
            :max="maxSteps"
            step="1"
            :value="currentStep"
            aria-label="时间轴"
            @input="onTimeRangeInput"
            @pointerdown="beginSliderFocusOnRange"
            @pointerup="endSliderFocus"
            @pointercancel="endSliderFocus"
          />
        </div>
        <div class="time-slider-wrap">
          <div class="t-ticks">
            <span
              v-for="(m, i) in YEAR_MARKS"
              :key="m.year"
              class="t-tick clickable"
              :class="{
                't-tick--start': i === 0,
                't-tick--end':
                  i === YEAR_MARKS.length - 1 && yearMarkPosition(m.year, maxSteps) >= 100,
              }"
              :style="{ left: yearMarkPosition(m.year, maxSteps) + '%' }"
              @click="jumpToYear(m.year)"
              >{{ m.label }}</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 面板内边距 0.1cell（与 LayerControlPanel 一致）；段落间距 0.2cell */
.forecast-ctrl {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: v-bind(cell8px);
  box-sizing: border-box;
  gap: v-bind(cell16px);
}

/* 按钮网格：2×2 自上而下读（货物/集装箱，活跃度/同比增速）。三格横排会让第四格
   无处安放，也会变成左右扫读；竖排顺序与业务阅读一致。 */
.btn-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: minmax(0, 1fr);
  gap: v-bind(cell16px);

  /* 撑满面板剩余高度：原来 flex:none 固定 0.8cell，4×4 面板下面空出一大片 */
  flex: 1 1 auto;
  min-height: 0;

  /* 容量出口（c043）：面板变矮时按钮不被 GCSPanel 的 overflow:hidden 裁掉，仍可滚可达。
     单行 3 个指标在 1440/900 下不会触发滚动条；保留声明是为了小视口不静默截断。 */
  overflow-y: auto;
}

.btn-cell {
  border-radius: var(--GCS-radius-lg);
  transition:
    background-color var(--GCS-duration-base),
    border-color var(--GCS-duration-base);
}

.btn-cell.sel {
  background: var(--GCS-bg-active);
  border: 1px solid var(--GCS-color-primary);
}

.btn-cell.ing {
  background: var(--GCS-color-primary);
  border: 1px solid var(--GCS-color-primary);
}

.ind-icon {
  font-size: v-bind(iconFontSizeCss);
  line-height: 1;
}

/* ===== 运河情景行 ===== */
.scenario-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: v-bind(cell8px);
}

.scenario-row.off .scenario-label {
  color: var(--GCS-text-muted);
}

.scenario-label {
  font-size: v-bind(smallFontSizeCss);
  color: var(--GCS-text-secondary);
  white-space: nowrap;
}

.scenario-chips {
  display: flex;
  gap: v-bind(cell8px);
  flex: 1;
  min-width: 0;
}

/* 静态面见 style.css 的 .gcs-chip（F29 收口）；只有随 cell 尺寸走的两项留在组件内 */
.scenario-chip {
  padding: v-bind(cell8px) 0;
  font-size: v-bind(smallFontSizeCss);
}

/* ===== 时间轴（滑块收进统一卡片；控件行高 0.8cell，与卡片行高同源） ===== */
.time-section {
  flex-shrink: 0;

  /* 气泡带：胶囊画在滑块上方这段留白里，居中于「情景行底边」与「滑块顶边」之间，
     否则 bottom:100% 会直接压到情景按钮上（用户截图复现）。 */

  padding-top: 20px;

  /* 不再 margin-top:auto 顶到底：指标网格已 flex:1 吃掉剩余高度，
     再贴底会在情景行与时间轴之间留一条空带 */
  margin-top: 0;
}

.time-grid {
  display: grid;
  grid-template-columns: 1fr;
  align-items: center;
}

/* 裸露滑块行：整行即一个可拖的 range；当前时间只在滑动时以气泡跟手显示 */
.time-card {
  position: relative;
  grid-column: 1;
  grid-row: 1;
  display: flex;
  align-items: center;
  height: v-bind(btnHeightCss);
  padding: 0;

  /* 不再套一层描边卡片：时间轴与浸没页的水位滑块同一种裸露形态，
     外框只会让它看起来像「另一个可点的按钮」 */
  border: none;
  background: transparent;
}

.time-bubble {
  position: absolute;
  bottom: calc(100% + 4px);

  /* 气泡在 padding-top 的留白带内垂直居中：4px 上移 + 20px 带高 ⇒ 视觉居中间距约 11px */
  left: var(--pos, 0%);
  transform: translateX(-50%);
  padding: 2px 8px;
  border-radius: var(--GCS-radius-md);
  background: var(--GCS-color-primary);
  color: var(--GCS-text-inverse);
  font-size: v-bind(smallFontSizeCss);
  line-height: 1.2;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  opacity: 0;
  pointer-events: none;
  z-index: 2;
  box-shadow: var(--GCS-shadow-md, 0 4px 12px rgb(0 0 0 / 18%));
  transition: opacity var(--GCS-duration-fast, 0.15s);
}

.time-card:hover .time-bubble,
.time-card:focus-within .time-bubble {
  opacity: 1;
}

.time-range {
  flex: 1;
  appearance: none;
  min-width: 0;

  /* 命中区 24px（WCAG 2.5.8）：视觉轨道仍是 14px，多出来的高度由透明盒吃掉，
     否则手机上手指按偏一两像素就滑不动。 */
  height: 24px;
  background: transparent;
  outline: none;
  cursor: pointer;
  margin: 0;
}

.time-range::-webkit-slider-runnable-track {
  height: var(--GCS-slider-thumb-size);
  border-radius: calc(var(--GCS-slider-thumb-size) / 2);
  background: linear-gradient(to right, var(--GCS-border-default), var(--GCS-color-primary));
}

.time-range::-webkit-slider-thumb {
  appearance: none;
  width: var(--GCS-slider-thumb-size);
  height: var(--GCS-slider-thumb-size);
  border-radius: var(--GCS-radius-round);
  background: var(--GCS-color-primary);
  border: 2px solid var(--GCS-bg-panel);
  box-shadow: var(--GCS-shadow-sm);
  cursor: pointer;
}

.time-range::-moz-range-track {
  height: var(--GCS-slider-thumb-size);
  border-radius: calc(var(--GCS-slider-thumb-size) / 2);
  background: linear-gradient(to right, var(--GCS-border-default), var(--GCS-color-primary));
}

.time-range::-moz-range-thumb {
  width: var(--GCS-slider-thumb-size);
  height: var(--GCS-slider-thumb-size);
  border-radius: var(--GCS-radius-round);
  background: var(--GCS-color-primary);
  border: 2px solid var(--GCS-bg-panel);
  box-shadow: var(--GCS-shadow-sm);
  cursor: pointer;
}

.time-slider-wrap {
  position: relative;
  grid-column: 1;
  grid-row: 2;
  align-self: start;
  height: 18px;
}

.t-ticks {
  position: absolute;
  bottom: 0;

  /* 与卡片内滑块同宽：卡片左右各 1px 边框 + 8px 内边距，滑块撑满剩余宽度 */
  left: 9px;
  right: 9px;
  margin: 0;
  height: 18px;
}

.t-tick {
  position: absolute;
  transform: translateX(-50%);
  font-size: v-bind(smallFontSizeCss);
  color: var(--GCS-text-muted);
  white-space: nowrap;
}

.t-tick.clickable {
  color: var(--GCS-color-primary);
  font-weight: 500;
  cursor: pointer;
}

.t-tick.clickable:hover {
  color: var(--GCS-color-primary-hover);
  text-decoration: underline;
}

/* 首尾刻度收进面板：起点改左对齐、终点改右对齐（translateX(-50%) 会溢出面板被裁切） */
.t-tick--start {
  transform: none;
}

.t-tick--end {
  transform: translateX(-100%);
}

/* ing 态图标反色（其余视觉由 .btn-cell.ing 组合提供；选择卡片样式归 SliderSelectCard） */
.btn-cell.ing .ind-icon {
  color: var(--GCS-text-inverse);
}
</style>
