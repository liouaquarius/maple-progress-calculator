<script setup>
import { computed } from 'vue'
import { store, enabledBosses } from '../store.js'
import { maxDailyArea } from '../lib/calc.js'
import { areaIconUrl } from '../utils/icon.js'
import Icon from './Icon.vue'
import BossBadge from './BossBadge.vue'

// 上方摘要：把 input 頁的資訊濃縮顯示。
const dailyArea = computed(() => maxDailyArea(store.level, store.data.areas))
</script>

<template>
  <div class="summary">
    <div class="group">
      <div class="row"><span class="k">當前等級</span><span class="v">Lv.{{ store.level }}</span></div>
      <div class="row">
        <span class="k">每日區域</span>
        <span class="v area" v-if="dailyArea">
          <Icon :src="areaIconUrl(dailyArea)" :size="22" />
          {{ dailyArea.name_zh }}（Lv.{{ dailyArea.req_level }}）
        </span>
        <span class="v" v-else>（等級不足）</span>
      </div>
    </div>

    <div class="group">
      <div class="row">
        <span class="k">可攻略 Boss</span>
        <span class="v">
          <template v-if="enabledBosses.length">
            <BossBadge
              v-for="b in enabledBosses"
              :key="b.boss"
              :boss="b.boss"
              :difficulty="b.difficulty"
              :party-size="b.partySize"
            />
          </template>
          <em v-else class="muted">尚未於輸入頁選擇</em>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary { background: #20202a; border: 1px solid #33333c; border-radius: 8px; margin-bottom: 1rem; }
.group { padding: 0.7rem 1rem; }
.group + .group { border-top: 1px solid #33333c; }
.row { display: flex; gap: 0.6rem; padding: 0.15rem 0; font-size: 0.9rem; align-items: center; }
.k { color: #8aa; min-width: 5.5rem; }
.v { color: #e6e6e6; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.v.area { gap: 0.35rem; }
.muted { color: #888; font-style: normal; }
</style>
