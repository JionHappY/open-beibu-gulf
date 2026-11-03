<script setup lang="ts">
/**
 * 首页「分析入口」方格 —— 手机档控制台里用的完全体入口。
 *
 * 为什么在首页放一份：手机档 dock 收成「首页 / ＋ / 个人中心」三格，5 个分析页
 * 收进了 ＋ 的半圆。半圆适合「已经知道要哪个」；首页这一屏负责「不知道要哪个時
 * 先看一眼」——每个分析一行说明，点进整页。
 *
 * 标签与路由都由 navItems（业务层注册）给，本组件只补一句说明文案，
 * 不在组件里另抄一份路由表。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { AppIcon, isIconName } from '@/shared'

import { businessNavItems } from '../navConfig'

/** 说明文案（导航项里没有这份信息，且它只用来解释「这个分析做什么」） */
const DESC: Record<string, string> = {
  '/site-suitability': '按 AHP 准则打分，给出港址推荐位次',
  '/forecast': '吞吐量与活跃度的时间序列预测',
  '/flood-analysis': '水位—淹没范围与受影响设施评估',
  '/route-analysis': '船舶航线寻路与航程测算',
}

const router = useRouter()

const entries = computed(() =>
  businessNavItems.value.map((i) => ({
    path: i.path,
    label: i.label,
    icon: i.icon,
    disabled: i.disabled,
    desc: DESC[i.path] ?? '',
  }))
)

function open(path: string): void {
  void router.push(path)
}
</script>

<template>
  <ul class="home-analysis" aria-label="分析入口">
    <li v-for="item in entries" :key="item.path">
      <button
        type="button"
        class="home-analysis__item"
        :disabled="item.disabled"
        @click="open(item.path)"
      >
        <span class="home-analysis__icon" aria-hidden="true">
          <AppIcon v-if="item.icon && isIconName(item.icon)" :name="item.icon" />
        </span>
        <span class="home-analysis__text">
          <span class="home-analysis__label">{{ item.label }}</span>
          <span class="home-analysis__desc">{{ item.desc }}</span>
        </span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.home-analysis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.home-analysis__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  padding: 8px;
  border: 1px solid var(--GCS-border-light);
  border-radius: var(--GCS-radius-md);
  background-color: var(--GCS-bg-panel);
  color: var(--GCS-text-primary);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--GCS-duration-base) ease;
}

.home-analysis__item:hover:not(:disabled) {
  background-color: var(--GCS-bg-hover);
}

.home-analysis__item:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.home-analysis__icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--GCS-radius-sm);
  background-color: var(--GCS-bg-active);
  font-size: 15px;
}

.home-analysis__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.home-analysis__label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-analysis__desc {
  font-size: 11px;
  line-height: 1.25;
  color: var(--GCS-text-muted);

  /* 两行封顶：窄屏下一行放不下「按 AHP 准则打分，给出港址推荐位次」 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
