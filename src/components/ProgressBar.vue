<script setup>
import { computed } from 'vue'
import { iconUrl } from '../utils/icon.js'
import { barFill } from '../utils/itemColors.js'
import { fmtMD } from '../lib/schedule.js'
import Icon from './Icon.vue'

const props = defineProps({
  item: { type: String, required: true }, // item id（icon + 主色）
  label: { type: String, required: true },
  value: { type: Number, default: 0 }, // 目前累計
  projected: { type: Number, default: null }, // 到目標日的預估累計（null = 不顯示預估段）
  total: { type: Number, default: 0 },
  marks: { type: Array, default: () => [] }, // [{ pct, date, final }] 各 mission 邊界
  labelAllFuture: { type: Boolean, default: false }, // 無目標日期時：所有超過目前進度的邊界都標日期
})

const valuePct = computed(() => (props.total ? Math.min(100, (props.value / props.total) * 100) : 0))
const projVal = computed(() => (props.projected == null ? props.value : props.projected))
const projectedPct = computed(() => (props.total ? Math.min(100, (projVal.value / props.total) * 100) : 0))
const remaining = computed(() => Math.max(0, props.total - props.value))

// 刻度線：不含最後 100%（bar 邊緣即該線）
const ticks = computed(() => props.marks.filter((m) => !m.final))

// 要標日期的邊界：
//  - 無目標日期：所有超過目前進度者
//  - 有目標日期：落在「目前 ~ 目標日預估」區間者
const tickLabels = computed(() =>
  props.marks.filter((m) => {
    if (!m.date) return false
    if (m.pct <= valuePct.value + 0.001) return false
    return props.labelAllFuture || m.pct <= projectedPct.value + 0.001
  }),
)
</script>

<template>
  <!-- display:contents：各元素直接成為父層 .bars grid 的格子 -->
  <div class="bar-row">
    <span class="label"><Icon :src="iconUrl('item', item)" :size="18" /> {{ label }}</span>
    <div class="bar-wrap">
      <div class="bar">
        <div class="fill" :style="{ width: valuePct + '%', background: barFill(item) }"></div>
        <div
          v-if="projectedPct > valuePct"
          class="fill proj"
          :style="{ left: valuePct + '%', width: projectedPct - valuePct + '%', background: barFill(item) }"
        ></div>
        <div v-for="(m, i) in ticks" :key="i" class="tick" :style="{ left: m.pct + '%' }"></div>
      </div>
      <span
        v-for="(m, i) in tickLabels"
        :key="i"
        class="tick-label"
        :class="{ final: m.final }"
        :style="{ left: m.pct + '%' }"
        >{{ fmtMD(m.date) }}</span
      >
    </div>
    <span class="num">{{ value }}</span>
    <span class="slash">/</span>
    <span class="num">{{ total }}</span>
    <span class="rest">（還差&nbsp;<span class="rnum">{{ remaining }}</span>）</span>
  </div>
</template>

<style scoped>
.bar-row { display: contents; }
.label { color: #8aa; display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
.bar-wrap { position: relative; }
.bar { position: relative; height: 14px; background: #1a1a20; border: 1px solid #3a3a44; border-radius: 7px; overflow: hidden; }
.fill { position: absolute; top: 0; bottom: 0; left: 0; }
.fill.proj { opacity: 0.4; }
.tick { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(255, 255, 255, 0.55); }
.tick-label { position: absolute; top: 15px; transform: translateX(-50%); font-size: 0.68rem; color: #9aa; white-space: nowrap; }
.tick-label.final { transform: translateX(-100%); } /* 100% 標註靠 bar 右端內側，避免溢出 */
.num { color: #ccc; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.slash { color: #888; }
.rest { color: #ccc; white-space: nowrap; }
.rnum { display: inline-block; min-width: 5ch; text-align: right; font-variant-numeric: tabular-nums; }
</style>
