<script setup>
import { computed, watch } from 'vue'
import { store, difficultyMap, itemMap, destinyBosses, maxSoloOrder, resetInput } from '../store.js'
import {
  stageTotal,
  resolveInStage,
  astraTotals,
  astraAccumulated,
  ASTRA_TRACES_STORAGE_CAP,
} from '../lib/calc.js'
import BossSelector from '../components/BossSelector.vue'
import Icon from '../components/Icon.vue'
import { iconUrl } from '../utils/icon.js'
import { roman } from '../utils/format.js'

const destinyStage = computed(() => store.data.destiny[store.destiny.stageIndex])

// 當前可輸入上限：該 stage 扣掉已提交 mission 後的剩餘容量（= 當前 mission 起算到結尾的成本和）。
const destinyCap = computed(
  () => stageTotal(destinyStage.value) - resolveInStage(destinyStage.value, store.destiny.missionIndex, 0),
)

// Astra 痕跡上限 = min(依 mission 邏輯剩餘量, 儲存上限 1000)；碎片無上限。
const astraTracesCap = computed(() => {
  const submitted = astraAccumulated(store.data.astra, store.astra.missionIndex, 0, 0).traces
  const remaining = astraTotals(store.data.astra).traces - submitted
  return Math.min(remaining, ASTRA_TRACES_STORAGE_CAP)
})

// 貨幣中文名（直接調用 json 的 name_zh）
const nameOf = (id) => itemMap.value[id]?.name_zh ?? id

// 以 cap 對儲存值本身做鉗制：get 回傳目前值，set 時夾在 [0, max]，確保不超界。
const clampModel = (get, set, maxRef) =>
  computed({
    get,
    set: (v) => {
      // 清空時保留 null，讓 placeholder 顯示（計算時 null 視為 0）。
      if (v === '' || v == null) {
        set(null)
        return
      }
      const n = Number(v) || 0
      const max = maxRef?.value
      set(Math.max(0, max == null ? n : Math.min(n, max)))
    },
  })

const currentResolve = clampModel(
  () => store.destiny.currentResolve,
  (v) => (store.destiny.currentResolve = v),
  destinyCap,
)
const currentTraces = clampModel(
  () => store.astra.currentTraces,
  (v) => (store.astra.currentTraces = v),
  astraTracesCap,
)
const currentErion = clampModel(
  () => store.astra.currentErion,
  (v) => (store.astra.currentErion = v),
  null, // 碎片無上限
)

// 切換 stage/mission 時重設下層數值，維持輸入一致。
watch(() => store.destiny.stageIndex, () => { store.destiny.missionIndex = 0; store.destiny.currentResolve = null })
watch(() => store.destiny.missionIndex, () => { store.destiny.currentResolve = null })
watch(() => store.astra.missionIndex, () => { store.astra.currentTraces = null; store.astra.currentErion = null })

function onClear() {
  if (confirm('確定要清除所有輸入並還原為預設值？')) resetInput()
}
</script>

<template>
  <div class="input">
    <div class="toolbar">
      <button type="button" class="clear-btn" @click="onClear">清除輸入</button>
    </div>

    <div class="row">
      <section class="panel">
        <h2>角色資訊</h2>
        <div class="fields">
          <label>
            當前等級
            <input type="number" min="200" max="300" v-model.number="store.level" />
          </label>
        </div>
      </section>

      <section class="panel">
        <h2>計算期間  <span class="hint">Boss 攻略統一以每週四計算</span></h2>
        <div class="fields">
          <label>
            開始日期
            <input type="date" v-model="store.startDate" />
          </label>
          <label>
            <span class="toggle">
              <input type="checkbox" v-model="store.useTargetDate" /> 目標日期（選填）
            </span>
            <input type="date" v-model="store.targetDate" :min="store.startDate" :disabled="!store.useTargetDate" />
          </label>
        </div>
      </section>
    </div>

    <section class="panel">
      <h2>當前任務進度</h2>
      <div class="fields">
        <fieldset>
          <legend>命運武器</legend>
          <label>
            階段
            <select v-model.number="store.destiny.stageIndex">
              <option v-for="(s, i) in store.data.destiny" :key="s.stage" :value="i">階段 {{ roman(s.stage) }}</option>
            </select>
          </label>
          <label>
            任務
            <select v-model.number="store.destiny.missionIndex">
              <option v-for="(m, i) in destinyStage.missions" :key="m.mission" :value="i">任務 {{ roman(m.mission) }}</option>
            </select>
          </label>
          <label>
            <span class="cur"><Icon :src="iconUrl('item', 'resolve')" :size="16" /> {{ nameOf('resolve') }}</span>
            <input type="number" min="0" :max="destinyCap" :placeholder="`0 ~ ${destinyCap}`" v-model.number="currentResolve" />
          </label>
        </fieldset>

        <fieldset>
          <legend>阿斯特拉副武器</legend>
          <label>
            任務
            <select v-model.number="store.astra.missionIndex">
              <option v-for="(s, i) in store.data.astra" :key="s.mission" :value="i">任務 {{ roman(s.mission) }}</option>
            </select>
          </label>
          <label>
            <span class="cur"><Icon :src="iconUrl('item', 'battle_traces')" :size="16" /> {{ nameOf('battle_traces') }}</span>
            <input type="number" min="0" :max="astraTracesCap" :placeholder="`0 ~ ${astraTracesCap}`" v-model.number="currentTraces" />
          </label>
          <label>
            <span class="cur"><Icon :src="iconUrl('item', 'erion_fragment')" :size="16" /> {{ nameOf('erion_fragment') }}</span>
            <input type="number" min="0" placeholder="0 ~（無上限）" v-model.number="currentErion" />
          </label>
        </fieldset>
      </div>
    </section>

    <section class="panel">
      <h2>格蘭蒂斯 Boss</h2>
      <BossSelector
        :bosses="store.data.bosses"
        :difficulty-map="difficultyMap"
        :state="store.bossSel"
        :level="store.level"
        :destiny-bosses="destinyBosses"
        :max-solo-order="maxSoloOrder"
      />
    </section>
  </div>
</template>

<style scoped>
.input { display: flex; flex-direction: column; gap: 1rem; }
.toolbar { display: flex; justify-content: flex-end; }
.clear-btn { background: #3a2a2a; color: #e6b0b0; border: 1px solid #5c3a3a; border-radius: 6px; padding: 0.35rem 0.9rem; cursor: pointer; font-size: 0.85rem; }
.clear-btn:hover { background: #4a3232; border-color: #7a4a4a; }
.row { display: flex; gap: 1rem; flex-wrap: wrap; }
.row > .panel { flex: 1; min-width: 16rem; }
.panel { background: #232329; border: 1px solid #33333c; border-radius: 8px; padding: 1rem 1.2rem; }
.fields { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: flex-start; }
fieldset { border: 1px solid #3a3a44; border-radius: 6px; padding: 0.6rem 1rem; display: flex; gap: 1.2rem; flex-wrap: wrap; }
legend { color: #8aa; padding: 0 0.4rem; }
label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; }
.cur { display: inline-flex; align-items: center; gap: 0.25rem; }
.toggle { display: inline-flex; align-items: center; gap: 0.3rem; }
.hint { color: #888; font-size: 0.8rem; margin: 0.6rem 0 0; }
input:disabled { opacity: 0.4; cursor: not-allowed; }
input, select { background: #2a2a33; color: #e6e6e6; border: 1px solid #444; border-radius: 4px; padding: 3px 6px; }
input { width: 150px; }
input[type="checkbox"] { width: auto; }
</style>
