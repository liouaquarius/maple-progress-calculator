<script setup>
import { computed } from 'vue'
import { difficultyMap } from '../store.js'

const props = defineProps({
  difficulty: { type: String, required: true }, // difficulty id
})

const diff = computed(() => difficultyMap.value[props.difficulty])
const style = computed(() => ({
  background: diff.value?.color ?? '#2a2a33',
  color: diff.value?.textColor ?? '#e6e6e6',
}))
</script>

<template>
  <span class="badge" :style="style">{{ diff?.tier_zh ?? difficulty }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  border-radius: 4px;
  padding: 0.05rem 0.45rem;
  font-size: 0.78rem;
  font-weight: bold;
  line-height: 1.4;
  border: 1px solid rgba(255, 255, 255, 0.18);
}
</style>
