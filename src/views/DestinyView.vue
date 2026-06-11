<script setup>
import { computed } from 'vue'
import { store, enabledBosses, destinyDerived, itemMap, destinyCeiling, maxSoloOrder } from '../store.js'
import { bossWeeklyIncome, minWastePlan, perPerson, stageTotal, destinyReqOrder } from '../lib/calc.js'
import { destinyMissionSchedule, parseDate, thursdaysInRange, fmt } from '../lib/schedule.js'
import { roman, boundaryMarks } from '../utils/format.js'
import InputSummary from '../components/InputSummary.vue'
import StatCard from '../components/StatCard.vue'
import ProgressBar from '../components/ProgressBar.vue'
import ScheduleTable from '../components/ScheduleTable.vue'
import BossBadge from '../components/BossBadge.vue'

const weeklyResolve = computed(() => bossWeeklyIncome(enabledBosses.value, store.data).resolve)
const derived = computed(() => destinyDerived.value)

// 本週各 boss 每人份 resolve（只取 > 0）
const bossResolveItems = computed(() =>
  enabledBosses.value
    .map((sel) => {
      const boss = store.data.bosses.find((b) => b.id === sel.boss)
      const diff = boss?.difficulties.find((d) => d.tier === sel.difficulty)
      return { boss: sel.boss, difficulty: sel.difficulty, resolve: perPerson(diff?.rewards.resolve ?? 0, sel.partySize) }
    })
    .filter((x) => x.resolve > 0),
)

// 通關能力門檻：天花板 + 各 boss 的 destiny 需求 order
const gate = computed(() => {
  const orderByBoss = {}
  for (const b of store.data.bosses) {
    const o = destinyReqOrder(b)
    if (o != null) orderByBoss[b.id] = o
  }
  return { ceiling: destinyCeiling.value, orderByBoss }
})

// 逐 mission 達成日期，依 stage 分組（每個 stage 一張表）
const groupedSchedule = computed(() => {
  const rows = destinyMissionSchedule(
    store.data.destiny,
    derived.value.totalAccum,
    weeklyResolve.value,
    parseDate(store.startDate),
    store.destiny.stageIndex,
    store.destiny.missionIndex,
    store.useTargetDate ? parseDate(store.targetDate) : null,
    gate.value,
  )
  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.stage)) groups.set(row.stage, [])
    groups.get(row.stage).push(row)
  }
  return [...groups].map(([stage, missions]) => ({ stage, missions }))
})

const resolveName = computed(() => itemMap.value['resolve']?.name_zh ?? '決心')
const currentMission = computed(() => derived.value.stage.missions[store.destiny.missionIndex])

// 當前 mission 是否已可完成（排程狀態 ready）
const currentReady = computed(() => {
  const g = groupedSchedule.value.find((g) => g.stage === derived.value.stage.stage)
  return g?.missions[store.destiny.missionIndex]?.status === 'ready'
})

// 注意事項：① 提醒（destiny 自動滿足但所選難度不足、且該 mission 未卡關）；
//           ② 全 stage 掃描第一個卡關 mission（警示）；③ 階段 I 完成建議（僅階段 I 且未卡關）。三者可並存。
const notice = computed(() => {
  const allRows = groupedSchedule.value.flatMap((g) => g.missions)
  // 卡關警示：只取「仍 status === 'blocked'」者；已翻為 unreachable 的不再警示
  const blockedRow = allRows.find((r) => r.status === 'blocked')
  const block = blockedRow
    ? {
        reqBoss: blockedRow.reqBoss,
        stage: blockedRow.stage,
        mission: blockedRow.mission,
        date: blockedRow.date,
        lastOfStage: blockedRow.lastOfStage,
      }
    : null

  // 提醒：所有 stage 中，destiny 自動滿足(forced)但所選難度 order < destiny order、且該 mission 未卡關
  const reminders = []
  for (const stg of store.data.destiny) {
    const sRows = groupedSchedule.value.find((g) => g.stage === stg.stage)?.missions ?? []
    for (const m of stg.missions) {
      const rb = m.requirement?.boss
      if (!rb) continue
      const boss = store.data.bosses.find((b) => b.id === rb)
      const ro = destinyReqOrder(boss)
      if (ro == null) continue
      const forced = ro <= maxSoloOrder.value
      const selTier = store.bossSel[rb]?.difficulty
      const selOrder = boss?.difficulties.find((x) => x.tier === selTier)?.order ?? 0
      const row = sRows.find((r) => r.mission === m.mission)
      if (forced && selOrder < ro && row && !row.blocked) {
        reminders.push({ boss: rb, date: row.date ?? null })
      }
    }
  }

  const curRows = groupedSchedule.value.find((g) => g.stage === derived.value.stage.stage)?.missions ?? []

  // 階段 I 完成建議：僅在階段 I 且其本身未卡關
  let advice = null
  if (store.destiny.stageIndex === 0 && !curRows.some((r) => r.blocked)) {
    const rem = derived.value.remainingInStage
    if (rem <= 0) {
      advice = { ready: true }
    } else if (!weeklyResolve.value || !bossResolveItems.value.length) {
      advice = { noBoss: true }
    } else {
      const W = weeklyResolve.value
      const k = Math.ceil(rem / W)
      const remThatWeek = rem - (k - 1) * W
      const plan = minWastePlan(bossResolveItems.value, remThatWeek)
      advice = { date: curRows[curRows.length - 1]?.date ?? null, before: plan.before, after: plan.after, waste: plan.waste }
    }
  }

  return block || reminders.length || advice ? { block, reminders, advice } : null
})

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// 到目標日預估可額外獲得的 resolve（未啟用目標日期則為 0）
const projectedGain = computed(() =>
  store.useTargetDate
    ? thursdaysInRange(parseDate(store.startDate), parseDate(store.targetDate)) * weeklyResolve.value
    : 0,
)

// 每個階段一條進度條：value=目前累計、projected=到目標日預估、marks 含邊界到達日
const stageBars = computed(() => {
  const projTotal = derived.value.totalAccum + projectedGain.value
  let cumBefore = 0
  return store.data.destiny.map((stage) => {
    const total = stageTotal(stage)
    const value = clamp(derived.value.totalAccum - cumBefore, 0, total)
    const projected = clamp(projTotal - cumBefore, 0, total)
    const rows = groupedSchedule.value.find((g) => g.stage === stage.stage)?.missions ?? []
    const marks = boundaryMarks(stage.missions, 'resolve', total, rows.map((r) => r.date))
    cumBefore += total
    return { stage: stage.stage, total, value, projected, marks }
  })
})

</script>

<template>
  <InputSummary />

  <section class="panel">
    <h2>命運武器 — 當前進度：階段 {{ roman(derived.stage.stage) }} 任務 {{ roman(currentMission.mission) }}{{ currentReady ? '（可達成）' : '' }}</h2>

    <div class="stats">
      <StatCard item="resolve" :value="weeklyResolve" />
    </div>

    <h3>進度</h3>
    <div class="bars">
      <ProgressBar
        v-for="b in stageBars"
        :key="b.stage"
        item="resolve"
        :label="`階段 ${roman(b.stage)}`"
        :value="b.value"
        :projected="b.projected"
        :total="b.total"
        :marks="b.marks"
        :label-all-future="!store.useTargetDate"
      />
    </div>

    <h3>各階段達成時程</h3>
    <p class="hint">假設每週四攻略所有已勾選 Boss；溢出視為最佳化結轉。</p>
    <div class="stage-tables">
      <ScheduleTable v-for="g in groupedSchedule" :key="g.stage" :title="`階段 ${roman(g.stage)}`" :rows="g.missions" />
    </div>

    <template v-if="notice">
      <h3>注意事項</h3>

      <!-- 1. 提醒：達成日前需實際單人通關 -->
      <div v-if="notice.reminders?.length" class="advice info">
        <p v-for="r in notice.reminders" :key="r.boss" class="reminder">
          <span class="lead">💡</span><strong>{{ fmt(r.date) }}</strong> 前需實際單人通關
          <BossBadge :boss="r.boss" difficulty="destiny" :size="16" class="chip-gap" />
        </p>
      </div>

      <!-- 2. 卡關警告 -->
      <div v-if="notice.block" class="advice block">
        <span class="lead">⚠️</span><strong v-if="notice.block.date">{{ fmt(notice.block.date) }}</strong
        ><template v-if="notice.block.date"> 前</template>需單人通關
        <BossBadge :boss="notice.block.reqBoss" difficulty="destiny" :size="16" class="chip-gap" />
        <template v-if="notice.block.lastOfStage">，否則此階段{{ resolveName }}累積至上限後將溢出浪費（無法保留至下一階段）。</template>
      </div>

      <!-- 3. 攻略順序建議 -->
      <template v-if="notice.advice">
        <div v-if="notice.advice.ready" class="advice ok">目前累積已可完成階段 I，完成後即進入階段 II。</div>
        <div v-else-if="notice.advice.noBoss" class="advice muted">
          尚未勾選會產出{{ resolveName }}的 Boss，無法估算階段 I 完成時程。
        </div>
        <div v-else class="advice warn">
          <p>預計 <strong>{{ fmt(notice.advice.date) }}</strong> 完成階段 I（達成 100%）。當天建議攻略順序以最小化浪費：</p>
          <ol>
            <li>
              先清：
              <BossBadge v-for="b in notice.advice.before" :key="b.boss" :boss="b.boss" :difficulty="b.difficulty" :size="16" class="chip-gap" />
            </li>
            <li>完成階段 I 並<strong>推進到階段 II</strong></li>
            <li v-if="notice.advice.after.length">
              再清剩下的：
              <BossBadge v-for="b in notice.advice.after" :key="b.boss" :boss="b.boss" :difficulty="b.difficulty" :size="16" class="chip-gap" />
            </li>
          </ol>
          <p class="waste">最小浪費量：<strong>{{ notice.advice.waste }}</strong> {{ resolveName }}</p>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.panel { background: #232329; border: 1px solid #33333c; border-radius: 8px; padding: 1rem 1.2rem; }
.stats { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.stage-tables { display: flex; gap: 1.2rem; flex-wrap: wrap; }
.advice { border-radius: 6px; padding: 0.7rem 1rem; margin-top: 0.4rem; }
.advice.ok { background: #1f3320; border: 1px solid #2f5c33; }
.advice.warn { background: #33301f; border: 1px solid #5c552f; }
.advice.muted { background: #2a2a33; color: #9aa; }
.advice.block { background: #3a2020; border: 1px solid #6a2f2f; color: #ecb4b4; }
.advice.info { background: #20262e; border: 1px solid #33485c; color: #a9c7e6; }
.reminder { margin: 0.2rem 0; }
.lead { display: inline-block; width: 2em; text-align: center; font-style: normal; }
.advice ol { margin: 0.4rem 0; padding-left: 1.4rem; }
.advice li { margin: 0.2rem 0; }
.waste { margin: 1rem 0 0; color: #f0c674; }
.chip-gap { margin: 0 0.15rem; vertical-align: middle; }
.hint { color: #888; font-size: 0.8rem; margin: 0.3rem 0; }
h3 { font-size: 1rem; margin: 1rem 0 0.3rem; }
</style>
