<script setup>
// 方向 1 表格的「所需 Boss」單格內容（5 等明細表與區間總覽表共用）。
// compact = true 時，低分附註不顯示確切小計（區間內小計會隨等級變動）。
import { computed } from 'vue'
import { difficultyMap } from '../store.js'
import BossBadge from './BossBadge.vue'

const props = defineProps({
  req: { type: Object, required: true },
  compact: { type: Boolean, default: false },
})

const tierLabel = (t) => difficultyMap.value[t]?.tier_zh ?? t

// frontier 指示文字：拆成 pre / strong（硬性條件，上色粗體）/ post
const ft = computed(() => {
  const req = props.req
  if (req.status !== 'frontier') return null
  if (req.total === 1) return { pre: '完成下列 Boss：', strong: '', post: '' }
  if (req.need === req.total)
    return { pre: '下列 Boss ', strong: '皆須完成', post: `（共 ${req.total} 隻）：` }
  return { pre: '完成下列', strong: `任 ${req.need} 隻`, post: ` Boss（共 ${req.total} 隻）：` }
})
</script>

<template>
  <template v-if="req.status === 'level-only'">
    <span class="ok">僅靠等級即達標</span>
    <span v-if="req.gate" class="gate inline-badge">
      ，但仍須通關
      <BossBadge :boss="req.gate.bossId" :difficulty="req.gate.tier" :name="req.gate.bossName" :size="16" />
      <b class="cond">（段位門檻）</b>
    </span>
  </template>

  <template v-else-if="req.status === 'impossible'">
    <span v-if="req.gateUnreachable" class="no inline-badge">
      無法達成：門檻 Boss
      <BossBadge
        :boss="req.gateUnreachable.bossId"
        :difficulty="req.gateUnreachable.tier"
        :name="req.gateUnreachable.bossName"
        :size="16"
      />
      需 Lv.{{ req.gateUnreachable.entryLevel }} 才能入場
    </span>
    <span v-else class="no">即使全通可入場的 Boss 仍無法達成</span>
  </template>

  <template v-else>
    <div class="ftxt">
      {{ ft.pre }}<b v-if="ft.strong" class="cond">{{ ft.strong }}</b>{{ ft.post }}
      <b v-if="req.gate" class="cond">（段位門檻）</b>
    </div>
    <div class="chips">
      <span v-for="e in req.entries" :key="e.bossId + e.tier" class="chip">
        <BossBadge :boss="e.bossId" :difficulty="e.tier" :name="e.bossName" :size="18" />
        <small>{{ e.points.toLocaleString() }} 分</small>
      </span>
    </div>
    <div v-if="req.below > 0" class="below">
      <template v-if="compact">並須完成所有可入場且分數更低的 Boss（同名較低難度由系統自動計入）</template>
      <template v-else>
        並須實際完成所有分數低於 {{ req.points.toLocaleString() }} 的 Boss（小計
        {{ req.below.toLocaleString() }} 分；同名 Boss 的較低難度由系統自動計入）
      </template>
    </div>
  </template>
</template>

<style scoped>
.ftxt { font-size: 0.85rem; color: #bbc; margin-bottom: 0.35rem; }
.cond { color: #e0a060; font-weight: bold; }
.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chip { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; }
.chip small { color: #888; }
.below { margin-top: 0.4rem; font-size: 0.8rem; color: #9a9; }
.ok { color: #8ad08a; }
.no { color: #d08a8a; }
.gate { color: #e0a060; font-size: 0.85rem; }
.inline-badge { line-height: 1.9; }
.inline-badge :deep(.boss-badge) { vertical-align: middle; margin: 0 0.15rem; padding: 0.15rem 0.4rem; }
</style>
