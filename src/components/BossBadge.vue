<script setup>
import { computed } from 'vue'
import { bossMap } from '../store.js'
import { iconUrl } from '../utils/icon.js'
import Icon from './Icon.vue'
import DifficultyBadge from './DifficultyBadge.vue'

const props = defineProps({
  boss: { type: String, required: true }, // boss id
  difficulty: { type: String, default: '' }, // difficulty id
  partySize: { type: Number, default: null }, // 有值才顯示人數
  size: { type: Number, default: 20 },
  name: { type: String, default: '' }, // 顯示名覆寫（bossMap 查無此 boss 時用，如 CW S3 的 Kai）
})

const name = computed(() => props.name || bossMap.value[props.boss]?.name_zh || props.boss)
</script>

<template>
  <span class="boss-badge">
    <Icon :src="iconUrl('boss', boss)" :size="size" />
    <span class="name">{{ name }}</span>
    <DifficultyBadge v-if="difficulty" :difficulty="difficulty" />
    <span v-if="partySize != null" class="party">{{ partySize }}人</span>
  </span>
</template>

<style scoped>
.boss-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #2a2a33;
  border: 1px solid #3a3a44;
  border-radius: 5px;
  padding: 0.3rem 0.6rem;
}
.name { font-weight: bold; }
.party { color: #9aa; font-size: 0.8rem; }
</style>
