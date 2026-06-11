<script setup>
import { computed } from 'vue'
import { store, enabledBosses, astraDerived } from '../store.js'
import { bossWeeklyIncome, dailyErionPerWeek, dailyErionPerDay } from '../lib/calc.js'
import { astraSchedule, parseDate, thursdaysInRange, daysInRange } from '../lib/schedule.js'
import { roman, boundaryMarks } from '../utils/format.js'
import InputSummary from '../components/InputSummary.vue'
import StatCard from '../components/StatCard.vue'
import ProgressBar from '../components/ProgressBar.vue'
import ScheduleTable from '../components/ScheduleTable.vue'

// 每週產出（痕跡來自 boss；碎片來自 boss + daily）
const income = computed(() => {
  const b = bossWeeklyIncome(enabledBosses.value, store.data)
  const erionDaily = dailyErionPerWeek(store.level, store.data, store.daysPerWeek)
  return { traces: b.battle_traces, erionBoss: b.erion_fragment, erionDaily, erion: b.erion_fragment + erionDaily }
})

const derived = computed(() => astraDerived.value)
const dailyPerDay = computed(() => dailyErionPerDay(store.level, store.data))

const schedule = computed(() =>
  astraSchedule(
    store.data.astra,
    derived.value.accumulated,
    income.value.traces, // 痕跡每週（boss）
    income.value.erionBoss, // 碎片每週 boss 量
    dailyPerDay.value, // 碎片每日量
    parseDate(store.startDate),
    store.astra.missionIndex,
    store.useTargetDate ? parseDate(store.targetDate) : null,
  ),
)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// 到目標日預估可額外獲得量（未啟用目標日期則為 0）
const gains = computed(() => {
  if (!store.useTargetDate) return { traces: 0, erion: 0 }
  const s = parseDate(store.startDate)
  const t = parseDate(store.targetDate)
  const thu = thursdaysInRange(s, t)
  return { traces: thu * income.value.traces, erion: daysInRange(s, t) * dailyPerDay.value + thu * income.value.erionBoss }
})

// 當前 mission 是否已可完成（排程狀態 ready）
const currentReady = computed(() => schedule.value[store.astra.missionIndex]?.status === 'ready')

const projectedTraces = computed(() => clamp(derived.value.accumulated.traces + gains.value.traces, 0, derived.value.totals.traces))
const projectedErion = computed(() => clamp(derived.value.accumulated.erion + gains.value.erion, 0, derived.value.totals.erion))

// 各 mission 邊界刻度：兩條進度條各用自己資源的到達日（痕跡/碎片獨立）
const tracesMarks = computed(() =>
  boundaryMarks(store.data.astra, 'battle_traces', derived.value.totals.traces, schedule.value.map((r) => r.tracesDate)),
)
const erionMarks = computed(() =>
  boundaryMarks(store.data.astra, 'erion_fragment', derived.value.totals.erion, schedule.value.map((r) => r.erionDate)),
)
</script>

<template>
  <InputSummary />

  <section class="panel">
    <h2>阿斯特拉副武器 — 當前進度：任務 {{ roman(store.data.astra[store.astra.missionIndex].mission) }}{{ currentReady ? '（可達成）' : '' }}</h2>

    <div class="stats">
      <StatCard item="battle_traces" :value="income.traces" />
      <StatCard item="erion_fragment" :value="income.erion" :sub="`boss ${income.erionBoss} + daily ${income.erionDaily}`" />
    </div>

    <h3>進度</h3>
    <div class="bars">
      <ProgressBar item="battle_traces" label="痕跡" :value="derived.accumulated.traces" :projected="projectedTraces" :total="derived.totals.traces" :marks="tracesMarks" :label-all-future="!store.useTargetDate" />
      <ProgressBar item="erion_fragment" label="碎片" :value="derived.accumulated.erion" :projected="projectedErion" :total="derived.totals.erion" :marks="erionMarks" :label-all-future="!store.useTargetDate" />

    </div>

    <h3>各任務達成日期</h3>
    <p class="hint">假設每週四攻略所有已勾選 Boss、每日固定取得碎片。</p>
    <ScheduleTable :rows="schedule" />
  </section>
</template>

<style scoped>
.panel { background: #232329; border: 1px solid #33333c; border-radius: 8px; padding: 1rem 1.2rem; }
.stats { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.hint { color: #888; font-size: 0.8rem; margin: 0.3rem 0; }
.note { color: #888; font-size: 0.8rem; margin-top: 1rem; }
h3 { font-size: 1rem; margin: 1rem 0 0.3rem; }
</style>
