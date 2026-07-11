<script setup>
// 星力 — 機率成本表：star_force.json 的靜態排版展示（不做期望值等衍生指標）。
// 機率可切換「原始 / 常駐 ×1.05 加成後」；費用與救回表皆為 JSON 原值。
import { ref, computed } from 'vue'
import { store } from '../store.js'
import { boostedRates, SUCCESS_MULTIPLIER } from '../lib/starforce.js'
import { fmtInt, fmtPct } from '../utils/format.js'

const sf = computed(() => store.data.starforce)
const levels = computed(() => sf.value.meta.item_levels)

// 機率顯示模式：raw = 原始、boosted = 常駐加成後
const rateMode = ref('boosted')

const rows = computed(() =>
  sf.value.steps.map((s) => ({
    star: s.star,
    rates: rateMode.value === 'boosted' ? boostedRates(s.rates) : s.rates,
    cost: s.cost,
  })),
)

// 救回（restore）表：行 = 破壞星數，欄 = 有 restore 資料的裝等
const restore = computed(() => sf.value.repair.restore)
const restoreLevels = computed(() => Object.keys(restore.value.by_level).map(Number).sort((a, b) => a - b))
const restoreStars = computed(() => {
  const stars = new Set()
  for (const byStar of Object.values(restore.value.by_level)) {
    for (const s of Object.keys(byStar)) stars.add(Number(s))
  }
  return [...stars].sort((a, b) => a - b)
})
// 無 restore 資料的裝等（如 130）→ 表下註記
const restartOnlyLevels = computed(() => levels.value.filter((lv) => !restoreLevels.value.includes(lv)))
</script>

<template>
  <section class="panel">
    <h2>星力強化 — 機率與費用</h2>
    <ul class="rules">
      <li>機率預設顯示 <b>常駐成功率 ×{{ SUCCESS_MULTIPLIER }}</b> 加成後數值（剩餘機率依 破壞:維持 原比例分配），可切回原始值。</li>
      <li>費用為每次嘗試的強化楓幣；「—」表示該裝等無法強化到此星階。</li>
      <li>15★ 以下破壞率為 0；15/16/17★ 可用「防止破壞」（強化費 ×3，破壞轉為維持）。</li>
    </ul>

    <div class="mode-switch">
      <button :class="{ on: rateMode === 'boosted' }" @click="rateMode = 'boosted'">加成後機率</button>
      <button :class="{ on: rateMode === 'raw' }" @click="rateMode = 'raw'">原始機率</button>
    </div>

    <div class="scroll-x">
      <table class="grid">
        <thead>
          <tr>
            <th rowspan="2">星階</th>
            <th colspan="3" class="center">機率</th>
            <th :colspan="levels.length" class="center">強化費用（楓幣 / 次）</th>
          </tr>
          <tr>
            <th class="ok">成功</th>
            <th>維持</th>
            <th class="bad">破壞</th>
            <th v-for="lv in levels" :key="lv">Lv.{{ lv }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.star">
            <td class="lv">{{ r.star }}★ → {{ r.star + 1 }}★</td>
            <td class="ok">{{ fmtPct(r.rates.success) }}</td>
            <td>{{ fmtPct(r.rates.maintain) }}</td>
            <td :class="r.rates.destroy > 0 ? 'bad' : 'dim'">{{ r.rates.destroy > 0 ? fmtPct(r.rates.destroy) : '—' }}</td>
            <td v-for="lv in levels" :key="lv" :class="{ dim: r.cost[lv] == null }">
              {{ r.cost[lv] == null ? '—' : fmtInt(r.cost[lv]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <h2>破壞後救回</h2>
    <ul class="rules">
      <li><b>重新開始（restart）</b>：消耗 {{ sf.repair.restart.items }} 個相同道具，從 {{ sf.repair.restart.start_star }}★ 重來（不花楓幣，任何裝等皆可）。</li>
      <li><b>復原（restore）</b>：消耗下表道具數＋楓幣，回到破壞當下星數；上限 {{ restore.max_star }}★（超過時只能回到 {{ restore.max_star }}★）。</li>
      <li v-if="restartOnlyLevels.length" class="dim">Lv.{{ restartOnlyLevels.join(' / ') }} 無復原資料，破壞後僅能重新開始。</li>
    </ul>

    <div class="scroll-x">
      <table class="grid">
        <thead>
          <tr>
            <th rowspan="2">破壞星數</th>
            <th v-for="lv in restoreLevels" :key="lv" colspan="2" class="center lv-head">Lv.{{ lv }}</th>
          </tr>
          <tr>
            <template v-for="lv in restoreLevels" :key="lv">
              <th class="item-col">道具</th>
              <th>楓幣</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr v-for="star in restoreStars" :key="star">
            <td class="lv">{{ star }}★</td>
            <template v-for="lv in restoreLevels" :key="lv">
              <template v-if="restore.by_level[lv]?.[star]">
                <td class="item-col">{{ restore.by_level[lv][star].items }}</td>
                <td>{{ fmtInt(restore.by_level[lv][star].meso) }}</td>
              </template>
              <template v-else>
                <td class="item-col dim">—</td>
                <td class="dim">—</td>
              </template>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.panel { background: #232329; border: 1px solid #33333c; border-radius: 8px; padding: 1rem 1.2rem; margin-bottom: 1.2rem; }
.rules { color: #aaa; font-size: 0.85rem; margin: 0.4rem 0 0.8rem; padding-left: 1.1rem; }
.rules li { margin: 0.2rem 0; }
.rules b { color: #cdf; }
.mode-switch { display: flex; width: fit-content; gap: 0.3rem; margin-bottom: 0.7rem; }
.mode-switch button {
  background: transparent; color: #aab; border: 1px solid #3a3a44;
  border-radius: 6px; padding: 0.3rem 0.8rem; cursor: pointer; font-size: 0.85rem;
}
.mode-switch button:hover { background: #2a2a33; }
.mode-switch button.on { background: #3a4a6a; color: #fff; border-color: #3a4a6a; }
.scroll-x { overflow-x: auto; }
.grid { width: 100%; border-collapse: collapse; white-space: nowrap; }
.grid th, .grid td { border: none; border-bottom: 1px solid #33333c; padding: 0.4rem 0.6rem; text-align: right; }
.grid th { color: #99a; font-weight: 600; font-size: 0.85rem; }
.grid th.center { text-align: center; }
/* 救回表：每個裝等（道具+楓幣 一組）左側加分隔線，道具欄置中 */
.grid .lv-head, .grid .item-col { border-left: 1px solid #33333c; }
.grid td.item-col, .grid th.item-col { text-align: center; }
.grid td { font-variant-numeric: tabular-nums; font-size: 0.85rem; }
.lv { text-align: left; white-space: nowrap; color: #cdf; }
.ok { color: #8ad08a; }
.bad { color: #d08a8a; }
.dim { color: #666; }
</style>
