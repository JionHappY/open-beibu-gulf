<script setup lang="ts">
import { RadarChart, SNAPSHOT_SELECTED_TYPES, SNAPSHOT_XIAOQU } from '@/visualization'

import GCSPanel from './GCSPanel.vue'
</script>

<template>
  <GCSPanel :w="4" :h="4" anchor="top-right" :offset-x="0" :offset-y="1.25">
    <RadarChart
      :visible="true"
      :xiaoqu="SNAPSHOT_XIAOQU"
      :selected-types="SNAPSHOT_SELECTED_TYPES"
      :snapshot="true"
    />
  </GCSPanel>
</template>
