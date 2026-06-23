<script setup>
// navbar 分頁按鈕（純呈現）。badge 有值時於右上角顯示收角緞帶（如 EVENT）。
defineProps({
  label: { type: String, required: true },
  active: { type: Boolean, default: false },
  badge: { type: String, default: '' }, // 空字串 = 不顯示緞帶
})
defineEmits(['select'])
</script>

<template>
  <button class="tab" :class="{ on: active }" @click="$emit('select')">
    {{ label }}
    <span v-if="badge" class="ribbon">{{ badge }}</span>
  </button>
</template>

<style scoped>
.tab {
  position: relative;
  background: transparent; color: #aab; border: 1px solid transparent;
  border-radius: 6px; padding: 0.35rem 0.9rem; cursor: pointer; font-size: 0.95rem;
}
.tab:hover { background: #2a2a33; }
.tab.on { background: #3a4a6a; color: #fff; }

/* 突出的長方形緞帶（暗金底，向右上突出，整體約原本 75% 大小） */
.ribbon {
  position: absolute;
  top: -5px; right: -9px;
  background: #ffd700; color: #1a1a22;
  font-size: 0.45rem; font-weight: 800; letter-spacing: 0.3px;
  line-height: 1.6;
  padding: 1px 6px;
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}
</style>
