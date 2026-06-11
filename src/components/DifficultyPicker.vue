<script setup>
import { difficultyMap } from '../store.js'

const props = defineProps({
  options: { type: Array, required: true }, // [{ tier, ... }] 可選難度（不含 destiny 標記）
  modelValue: { type: String, default: '' }, // 目前選的 tier id
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

// 顏色 / 名稱皆讀自 difficulty.json
function style(tier) {
  const d = difficultyMap.value[tier]
  return d ? { background: d.color, color: d.textColor } : {}
}
function label(tier) {
  return difficultyMap.value[tier]?.tier_zh ?? tier
}
</script>

<template>
  <div class="diff-group">
    <button
      v-for="d in options"
      :key="d.tier"
      type="button"
      class="diff-btn"
      :class="{ on: modelValue === d.tier }"
      :style="style(d.tier)"
      :disabled="disabled"
      @click="emit('update:modelValue', d.tier)"
    >
      {{ label(d.tier) }}
    </button>
  </div>
</template>

<style scoped>
.diff-group { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.diff-btn {
  border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 4px;
  padding: 2px 8px; font-size: 0.78rem; font-weight: bold; cursor: pointer;
  opacity: 0.4; transition: opacity 0.1s;
}
.diff-btn:hover:not(:disabled) { opacity: 0.7; }
.diff-btn.on { opacity: 1; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.85); }
.diff-btn:disabled { cursor: not-allowed; }
</style>
