<script setup>
// navbar 下拉分類：桌面 hover 即展開（CSS :hover），click 可釘住/收合（觸控裝置唯一開法）。
// 點擊外部、按 Esc、或路由變更（選了項目）時收合。
// 子項任一有 badge 時，分類標題同步顯示緞帶（收合時仍可見）。
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({
  label: { type: String, required: true },
  items: { type: Array, required: true }, // [{ label, path, badge? }]
})

const route = useRoute()
const router = useRouter()
const open = ref(false)
const wrap = ref(null)

const active = computed(() => props.items.some((it) => it.path === route.path))
const badge = computed(() => props.items.find((it) => it.badge)?.badge ?? '')

watch(() => route.path, () => { open.value = false })

const onDocClick = (e) => {
  if (wrap.value && !wrap.value.contains(e.target)) open.value = false
}
const onKey = (e) => {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="wrap" class="group" :class="{ open }">
    <button class="tab" :class="{ on: active }" @click="open = !open">
      {{ label }} <span class="caret">▾</span>
      <span v-if="badge" class="ribbon">{{ badge }}</span>
    </button>
    <div class="panel">
      <button
        v-for="it in items"
        :key="it.path"
        class="item"
        :class="{ on: route.path === it.path }"
        @click="router.push(it.path)"
      >
        {{ it.label }}
        <span v-if="it.badge" class="ribbon">{{ it.badge }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.group { position: relative; }

/* 標題按鈕：與 NavTab 同視覺 */
.tab {
  position: relative;
  background: transparent; color: #aab; border: 1px solid transparent;
  border-radius: 6px; padding: 0.35rem 0.9rem; cursor: pointer; font-size: 0.95rem;
}
.tab:hover { background: #2a2a33; }
.tab.on { background: #3a4a6a; color: #fff; }
.caret { font-size: 0.7rem; opacity: 0.7; }

/* 下拉面板：hover 或 click 釘住時顯示 */
.panel {
  display: none;
  position: absolute; top: 100%; left: 0; z-index: 20;
  min-width: max-content;
  padding: 0.3rem;
  background: #232329; border: 1px solid #33333c; border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
}
.group:hover .panel,
.group.open .panel { display: flex; flex-direction: column; gap: 0.15rem; }

.item {
  position: relative;
  background: transparent; color: #aab; border: 1px solid transparent;
  border-radius: 6px; padding: 0.4rem 1.6rem 0.4rem 0.9rem;
  cursor: pointer; font-size: 0.9rem; text-align: left; white-space: nowrap;
}
.item:hover { background: #2a2a33; }
.item.on { background: #3a4a6a; color: #fff; }

/* 收角緞帶（與 NavTab 一致） */
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
.item .ribbon { top: 50%; right: 6px; transform: translateY(-50%); }
</style>
