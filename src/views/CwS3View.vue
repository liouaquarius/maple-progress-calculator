<script setup>
import { ref, computed } from 'vue'
import { store, difficultyMap } from '../store.js'
import BossBadge from '../components/BossBadge.vue'
import CwBossReq from '../components/CwBossReq.vue'
import {
  buildLevelPrefix,
  flattenBossEntries,
  tierToRequirements,
  tierToRequirementRanges,
  planToTier,
} from '../lib/cw.js'

const cw = computed(() => store.data.cw)
const prefix = computed(() => buildLevelPrefix(cw.value.levels))

// 難度中文名（對照 difficulty.json 的 tier_zh，無則退回原值）
const tierLabel = (t) => difficultyMap.value[t]?.tier_zh ?? t
// 段位中文名（無 name_zh 時退回英文）
const tierName = (t) => t.name_zh ?? t.name
// 依 id 取 cw boss 中文名（供 BossBadge 的 name 覆寫，bossMap 不含低階/Kai）
const bossNameById = (id) => cw.value.bosses.find((b) => b.id === id)?.name_zh ?? id

// 有 Kai 門檻的段位（資料驅動），供開頭規則以 BossBadge 呈現
const gatedTiers = computed(() =>
  cw.value.tiers
    .filter((t) => t.boss_clear_require)
    .map((t) => {
      const req = t.boss_clear_require
      const boss = cw.value.bosses.find((b) => b.id === req.boss)
      return {
        tierName: tierName(t),
        boss: req.boss,
        difficulty: req.difficulty,
        bossName: boss?.name_zh ?? boss?.name ?? req.boss,
      }
    }),
)

// 方向 1：每 5 等一個 case
const STEP_LEVELS = [260, 265, 270, 275, 280, 285, 290]
const ALL_LEVELS = Array.from({ length: 31 }, (_, i) => 260 + i)

// ---- 方向 1 ----
const targetTier = ref('master')
// 5 等明細表
const requirements = computed(() =>
  tierToRequirements(cw.value, prefix.value, targetTier.value, STEP_LEVELS),
)
// 變化節點區間表（結果改變時才換行）
const requirementRanges = computed(() =>
  tierToRequirementRanges(cw.value, prefix.value, targetTier.value, ALL_LEVELS),
)
// 區間等級標籤
const rangeLabel = (r) => (r.fromLevel === r.toLevel ? `Lv. ${r.fromLevel}` : `Lv. ${r.fromLevel}–${r.toLevel}`)

// 表格模式：'detail' = 每 5 等明細（預設）、'ranges' = 變化節點
const tableMode = ref('detail')
const colLabel = computed(() => (tableMode.value === 'ranges' ? '等級區間' : '目標等級'))
const rows = computed(() =>
  tableMode.value === 'ranges'
    ? requirementRanges.value.map((r) => ({ key: r.fromLevel, label: rangeLabel(r), req: r.req, compact: true }))
    : requirements.value.map((req) => ({ key: req.level, label: `Lv. ${req.level}`, req, compact: false })),
)

// ---- 方向 2 ----
const planLevel = ref(290)
const planBossKey = ref('') // '' = 不打 boss；否則 'bossId:tier'

const bossOptions = computed(() =>
  flattenBossEntries(cw.value.bosses).sort(
    (a, b) => a.points - b.points || a.bossName.localeCompare(b.bossName),
  ),
)

const planFrontier = computed(() => {
  if (!planBossKey.value) return null
  const [bossId, tier] = planBossKey.value.split(':')
  return { bossId, tier }
})

const plan = computed(() =>
  planToTier(cw.value, prefix.value, planLevel.value, planFrontier.value),
)
</script>

<template>
  <section class="panel">
    <h2>挑戰者世界 S3 — 段位 / 需求 雙向對照</h2>
    <ul class="rules">
      <li>等級分數為 <b>累加制</b>：達到某等級即取得 260 起每一級的分數總和。</li>
      <li>Boss 分數為 <b>任務制</b>，每筆計一次。</li>
      <li><b>同名 Boss 向下由系統自動計入</b>：完成某難度即一併取得該 Boss 所有較低難度的分數（含同分，如 西格諾斯 簡單／普通）。</li>
      <li><b>跨 Boss 不會自動完成</b>：較低分的其他 Boss 仍須各自實際通關，分數才會累計。計算上以「最高一隻」代表分界，僅為標示方便，下方仍會列出須一併完成的低分內容。</li>
      <li class="gate-rule">
        <template v-for="(g, i) in gatedTiers" :key="g.tierName">
          <span v-if="i" class="sep">、</span>
          <b>{{ g.tierName }}</b> 需通關
          <BossBadge :boss="g.boss" :difficulty="g.difficulty" :name="g.bossName" :size="16" />
        </template>
        （分數之外的硬性門檻）
      </li>
    </ul>
  </section>

  <!-- 方向 1 -->
  <section class="panel">
    <h2>目標段位 → 各等級所需 Boss</h2>
    <label class="field">
      目標段位
      <select v-model="targetTier">
        <option v-for="t in cw.tiers" :key="t.tier" :value="t.tier">
          {{ tierName(t) }}（{{ t.challengers_points.toLocaleString() }} 分）
        </option>
      </select>
    </label>

    <div class="mode-switch">
      <button :class="{ on: tableMode === 'detail' }" @click="tableMode = 'detail'">等級明細</button>
      <button :class="{ on: tableMode === 'ranges' }" @click="tableMode = 'ranges'">節點變化</button>
    </div>

    <table class="grid">
      <thead>
        <tr><th>{{ colLabel }}</th><th>所需 Boss</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <td class="lv">{{ row.label }}</td>
          <td><CwBossReq :req="row.req" :compact="row.compact" /></td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- 方向 2 -->
  <section class="panel">
    <h2>目標等級 + 目標 Boss → 預定段位</h2>
    <div class="fields">
      <label class="field">
        目標等級
        <select v-model.number="planLevel">
          <option v-for="lv in ALL_LEVELS" :key="lv" :value="lv">Lv. {{ lv }}</option>
        </select>
      </label>
      <label class="field">
        目標 Boss（計畫完成的最高一隻）
        <select v-model="planBossKey">
          <option value="">不打 Boss</option>
          <option v-for="e in bossOptions" :key="e.bossId + e.tier" :value="`${e.bossId}:${e.tier}`">
            {{ e.bossName }} {{ tierLabel(e.tier) }} — {{ e.points.toLocaleString() }}
          </option>
        </select>
      </label>
    </div>
    <p class="hint">Boss 分數假設你已實際完成所選 Boss，以及所有分數更低的 Boss（同名較低難度由系統自動計入）。</p>

    <div class="result">
      <div v-if="plan.frontierUnreachable" class="below inline-badge">
        ⚠ 所選 Boss
        <BossBadge
          :boss="plan.frontierUnreachable.bossId"
          :difficulty="plan.frontierUnreachable.tier"
          :name="plan.frontierUnreachable.bossName"
          :size="16"
        />
        需 Lv.{{ plan.frontierUnreachable.entryLevel }} 才能入場，Lv.{{ planLevel }} 無法挑戰，其分數未計入。
      </div>
      <div class="breakdown">
        <span>等級分數 <b>{{ plan.levelPoints.toLocaleString() }}</b></span>
        <span>＋ Boss 分數 <b>{{ plan.bossPoints.toLocaleString() }}</b></span>
        <span>＝ 總分 <b class="total">{{ plan.total.toLocaleString() }}</b></span>
      </div>
      <div class="tier-out">
        預定段位：
        <b v-if="plan.achieved" class="achieved">{{ tierName(plan.achieved) }}</b>
        <b v-else class="no">未達青銅</b>
        <span v-if="plan.blockedByGate" class="gate inline-badge">
          （分數已達 {{ tierName(plan.blockedByGate.tier) }}，但未通關
          <BossBadge
            :boss="plan.blockedByGate.req.boss"
            :difficulty="plan.blockedByGate.req.difficulty"
            :name="bossNameById(plan.blockedByGate.req.boss)"
            :size="16"
          />
          ，段位受門檻壓制）
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel { background: #232329; border: 1px solid #33333c; border-radius: 8px; padding: 1rem 1.2rem; margin-bottom: 1.2rem; }
.rules { color: #aaa; font-size: 0.85rem; margin: 0.4rem 0 0; padding-left: 1.1rem; }
.rules li { margin: 0.2rem 0; }
.rules b { color: #cdf; }
.gate-rule { line-height: 2; }
.gate-rule :deep(.boss-badge) { vertical-align: middle; margin: 0 0.15rem; padding: 0.15rem 0.4rem; }
.gate-rule .sep { margin: 0 0.1rem; }
.inline-badge { line-height: 1.9; }
.inline-badge :deep(.boss-badge) { vertical-align: middle; margin: 0 0.15rem; padding: 0.15rem 0.4rem; }
.field { display: inline-flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #aab; margin-bottom: 0.8rem; }
.fields { display: flex; gap: 1.5rem; flex-wrap: wrap; }
select { background: #1a1a22; color: #eee; border: 1px solid #44444f; border-radius: 6px; padding: 0.35rem 0.5rem; font-size: 0.9rem; }
.grid { width: 100%; border-collapse: collapse; }
.grid th, .grid td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid #33333c; vertical-align: top; }
.grid th { color: #99a; font-weight: 600; font-size: 0.85rem; }
.lv { white-space: nowrap; font-variant-numeric: tabular-nums; color: #cdf; }
.below { margin-top: 0.4rem; font-size: 0.8rem; color: #9a9; }
.hint { color: #888; font-size: 0.8rem; margin: 0.2rem 0 0.6rem; }
.mode-switch { display: flex; width: fit-content; gap: 0.3rem; margin-bottom: 0.7rem; }
.mode-switch button {
  background: transparent; color: #aab; border: 1px solid #3a3a44;
  border-radius: 6px; padding: 0.3rem 0.8rem; cursor: pointer; font-size: 0.85rem;
}
.mode-switch button:hover { background: #2a2a33; }
.mode-switch button.on { background: #3a4a6a; color: #fff; border-color: #3a4a6a; }
.achieved { color: #8ad08a; }
.no { color: #d08a8a; }
.gate { color: #e0a060; font-size: 0.85rem; }
.result { margin-top: 0.5rem; }
.breakdown { display: flex; gap: 0.8rem; flex-wrap: wrap; font-size: 0.9rem; color: #aab; margin-bottom: 0.6rem; }
.breakdown b { color: #eee; }
.breakdown .total { color: #cdf; font-size: 1.1rem; }
.tier-out { font-size: 1rem; }
.tier-out b { font-size: 1.2rem; }
</style>
