<script setup>
import { iconUrl } from '../utils/icon.js'
import Icon from './Icon.vue'

defineProps({
  item: { type: String, default: '' }, // item id（可選，提供時顯示 icon）
  value: { type: [Number, String], default: '' },
  sub: { type: String, default: '' },
})
</script>

<template>
  <div class="stat">
    <span class="k"><Icon v-if="item" :src="iconUrl('item', item)" :size="16" /> 每週獲取量</span>
    <span class="v">{{ value }}</span>
    <span v-if="sub" class="sub">{{ sub }}</span>
  </div>
</template>

<style scoped>
.stat { background: #2a2a33; border: 1px solid #3a3a44; border-radius: 6px; padding: 0.5rem 0.9rem; display: flex; flex-direction: column; }
.k { color: #8aa; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.25rem; }
.v { font-weight: bold; font-size: 1.1rem; text-align: center; }
.sub { color: #888; font-size: 0.75rem; }
</style>
