<script setup>
import { iconUrl } from '../utils/icon.js'
import { perPerson, destinyReqOrder } from '../lib/calc.js'
import Icon from './Icon.vue'
import DifficultyPicker from './DifficultyPicker.vue'

const props = defineProps({
  bosses: { type: Array, required: true }, // boss.json（含 difficulties: tier/rewards/order）
  difficultyMap: { type: Object, required: true },
  state: { type: Object, required: true }, // { [bossId]: { enabled, difficulty(tier), partySize, destiny } }
  level: { type: Number, required: true },
  destinyBosses: { type: Set, default: () => new Set() }, // 需顯示「命運」按鈕的 boss id
  maxSoloOrder: { type: Number, default: 0 }, // 玩家單人最高 order
})

// 可選的真實難度（排除 destiny 標記 tier）
function diffOptions(boss) {
  return boss.difficulties.filter((d) => d.tier !== 'destiny')
}
function rewardsOf(boss, tier) {
  return boss.difficulties.find((d) => d.tier === tier)?.rewards ?? {}
}
function each(boss, sel, currency) {
  return perPerson(rewardsOf(boss, sel.difficulty)[currency] ?? 0, sel.partySize)
}
function locked(boss) {
  return (boss.entry_level ?? 0) > props.level
}
function toggle(boss) {
  if (locked(boss)) return
  props.state[boss.id].enabled = !props.state[boss.id].enabled
}
// 命運按鈕配色讀自 difficulty.json 的 destiny 難度
function destinyStyle() {
  const d = props.difficultyMap['destiny']
  return d ? { background: d.color, color: d.textColor } : {}
}

// 命運：destiny 需求 order ≤ 單人最高 order → 強制 ON（不可關）；否則允許手動 on/off
function destinyForced(boss) {
  const r = destinyReqOrder(boss)
  return r != null && r <= props.maxSoloOrder
}
// 顯示優先序：locked → forced → manual（鎖定不亮、forced 強制亮、其餘看手動旗標）
function destinyOn(boss) {
  if (locked(boss)) return false
  return destinyForced(boss) || !!props.state[boss.id]?.destiny
}
function toggleDestiny(boss) {
  if (locked(boss) || destinyForced(boss)) return
  props.state[boss.id].destiny = !props.state[boss.id].destiny
}
</script>

<template>
  <table class="selector">
    <thead>
      <tr>
        <th>Boss</th>
        <th>入場</th>
        <th>難度</th>
        <th>人數</th>
        <th>命運</th>
        <th title="敵對者的決心"><Icon :src="iconUrl('item', 'resolve')" :size="18" /></th>
        <th title="猛烈的戰鬥痕跡"><Icon :src="iconUrl('item', 'battle_traces')" :size="18" /></th>
        <th title="俄里翁的碎片"><Icon :src="iconUrl('item', 'erion_fragment')" :size="18" /></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="boss in bosses" :key="boss.id" :class="{ off: !state[boss.id]?.enabled, locked: locked(boss) }">
        <td class="name">
          <button
            type="button"
            class="boss-btn"
            :class="{ on: state[boss.id].enabled }"
            :disabled="locked(boss)"
            @click="toggle(boss)"
          >
            <Icon :src="iconUrl('boss', boss.id)" :size="22" />
            {{ boss.name_zh }}
          </button>
        </td>
        <td class="num" :class="{ warn: locked(boss) }">Lv.{{ boss.entry_level }}</td>
        <td>
          <DifficultyPicker v-model="state[boss.id].difficulty" :options="diffOptions(boss)" :disabled="locked(boss)" />
        </td>
        <td>
          <select v-model.number="state[boss.id].partySize" :disabled="locked(boss)">
            <option v-for="n in boss.party_size_max" :key="n" :value="n">{{ n }}</option>
          </select>
        </td>
        <td>
          <button
            v-if="destinyBosses.has(boss.id)"
            type="button"
            class="destiny-btn"
            :class="{ on: destinyOn(boss) }"
            :style="destinyStyle()"
            :disabled="locked(boss) || destinyForced(boss)"
            @click="toggleDestiny(boss)"
          >
            命運
          </button>
          <span v-else class="num">—</span>
        </td>
        <td class="num">{{ each(boss, state[boss.id], 'resolve') }}</td>
        <td class="num">{{ each(boss, state[boss.id], 'battle_traces') }}</td>
        <td class="num">{{ each(boss, state[boss.id], 'erion_fragment') }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.selector { width: 100%; }
.name { padding: 2px 4px; }
.boss-btn {
  display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap; width: 100%;
  background: #2a2a33; color: #cfd2dc; border: 1px solid #3a3a44; border-radius: 6px;
  padding: 0.25rem 0.6rem; cursor: pointer; font-size: 0.9rem;
}
.boss-btn:hover:not(:disabled) { border-color: #5a6a9a; }
.boss-btn.on { background: #3a4a6a; border-color: #6a7fb5; color: #fff; }
.boss-btn:disabled { cursor: not-allowed; }
.num { text-align: right; }
.num.warn { color: #e07a7a; }
tr.off { opacity: 0.7; }
tr.locked { opacity: 0.35; }
select { background: #2a2a33; color: #e6e6e6; border: 1px solid #444; border-radius: 4px; padding: 2px 4px; }
select:disabled { opacity: 0.5; cursor: not-allowed; }
.destiny-btn {
  border: 1px solid #cfcfd2; border-radius: 4px;
  padding: 2px 10px; font-size: 0.78rem; font-weight: bold; cursor: pointer;
  opacity: 0.6; transition: opacity 0.1s;
}
.destiny-btn:hover:not(:disabled) { opacity: 0.8; }
.destiny-btn.on { opacity: 1; box-shadow: inset 0 0 0 2px #c9a23a; }
.destiny-btn:disabled:not(.on) { cursor: not-allowed; }
</style>
