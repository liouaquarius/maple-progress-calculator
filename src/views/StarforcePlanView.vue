<script setup>
// 星力 — 強化策略計算：輸入裝等/起始/目標星與價格參數，
// 由 solveStarforce（期望成本最小化）給出期望花費、分項與逐星建議動作。
import { computed, watch } from 'vue'
import { store } from '../store.js'
import { solveStarforce, boostedRates } from '../lib/starforce.js'
import { fmtInt, fmtMeso, fmtPct } from '../utils/format.js'

const sf = computed(() => store.data.starforce)
const input = store.starforce // reactive，直接綁定並持久化

// 該裝等可強化到的最高星（cost 非 null 的最大 star + 1）
const cap = computed(() => {
  let c = 0
  for (const s of sf.value.steps) if (s.cost[input.level] != null) c = Math.max(c, s.star + 1)
  return c
})

const startOptions = computed(() => Array.from({ length: cap.value }, (_, i) => i))
const targetOptions = computed(() =>
  Array.from({ length: cap.value - input.startStar }, (_, i) => input.startStar + 1 + i),
)

// 換裝等/星數時把非法組合拉回合法範圍（如 130 上限 20★，儲存的目標 22★ 需夾回）
watch(() => input.level, () => {
  if (input.targetStar > cap.value) input.targetStar = cap.value
  if (input.startStar >= input.targetStar) input.startStar = input.targetStar - 1
})
watch(() => input.startStar, (v) => {
  if (v >= input.targetStar) input.targetStar = Math.min(v + 1, cap.value)
})

const solved = computed(() => {
  try {
    const result = solveStarforce(
      sf.value,
      { level: input.level, startStar: input.startStar, targetStar: input.targetStar },
      { itemValue: input.itemValue ?? 0 },
      {
        safeguard: input.safeguard,
        discount: input.discountPct ? { costMultiplier: 1 - input.discountPct / 100 } : null,
      },
    )
    return { result, error: null }
  } catch (e) {
    return { result: null, error: e.message }
  }
})
const r = computed(() => solved.value.result)

// 逐星策略表（含加成後成功率；起始星以下 = 破壞重來後才會走到的路徑）
const stepByStar = computed(() => new Map(sf.value.steps.map((s) => [s.star, s])))
const ACTION_LABEL = {
  normal: '正常強化',
  safeguard: '防止破壞（費用 ×3）',
  additive: '追加卷軸',
  guaranteed: '必成卷軸',
}
const REPAIR_LABEL = { restart: '重新開始（回 12★）', restore: '復原（回原星）' }
const policyRows = computed(() =>
  (r.value?.policy ?? []).map((p) => ({
    ...p,
    success: boostedRates(stepByStar.value.get(p.star).rates).success,
    belowStart: p.star < input.startStar,
  })),
)

// safeguard 有開但 15–17★ 都沒被採用時，說明「已評估、不划算」以免使用者疑惑
const safeguardSkipped = computed(
  () =>
    input.safeguard &&
    policyRows.value.some((p) => p.star >= 15 && p.star <= 17) &&
    !policyRows.value.some((p) => p.action.type === 'safeguard'),
)
</script>

<template>
  <section class="panel">
    <h2>星力強化 — 策略計算</h2>
    <ul class="rules">
      <li>以「期望總花費（楓幣）最小化」求解：每一星自動在 正常強化 / 防止破壞 之間擇優，破壞後自動在 重新開始 / 復原 之間擇優。</li>
      <li>成功率已含常駐 ×1.05 加成。起始道具視為已持有（不計底價）；破壞後「重新開始」消耗的新道具以市價折算。</li>
      <li>期望值為長期平均，單次實際花費可能大幅高於或低於此數。</li>
    </ul>

    <div class="fields">
      <label class="field">
        裝備等級
        <select v-model.number="input.level">
          <option v-for="lv in sf.meta.item_levels" :key="lv" :value="lv">Lv.{{ lv }}</option>
        </select>
      </label>
      <label class="field">
        起始星數
        <select v-model.number="input.startStar">
          <option v-for="s in startOptions" :key="s" :value="s">{{ s }}★</option>
        </select>
      </label>
      <label class="field">
        目標星數
        <select v-model.number="input.targetStar">
          <option v-for="s in targetOptions" :key="s" :value="s">{{ s }}★</option>
        </select>
      </label>
      <label class="field">
        道具市價（楓幣/個）
        <input v-model.number="input.itemValue" type="number" min="0" step="1000000" placeholder="0 = 不計道具成本" />
        <span v-if="input.itemValue" class="preview">≈ {{ fmtMeso(input.itemValue) }}</span>
      </label>
      <label class="field">
        強化費折扣（%）
        <input v-model.number="input.discountPct" type="number" min="0" max="100" step="5" placeholder="無" />
      </label>
      <label class="field check">
        <span><input v-model="input.safeguard" type="checkbox" /> 允許防止破壞（15–17★）</span>
        <span class="preview">划算時才會被採用</span>
      </label>
    </div>
  </section>

  <section v-if="solved.error" class="panel">
    <p class="error">{{ solved.error }}</p>
  </section>

  <template v-else-if="r">
    <section class="panel">
      <h2>期望結果（{{ input.level }} 級裝備 {{ input.startStar }}★ → {{ input.targetStar }}★）</h2>
      <div class="cards">
        <div class="stat main">
          <span class="k">期望總花費</span>
          <span class="v">{{ fmtMeso(r.expectedMeso) }}</span>
          <span class="sub">{{ fmtInt(r.expectedMeso) }} 楓幣</span>
        </div>
        <div class="stat">
          <span class="k">期望道具消耗（破壞救回）</span>
          <span class="v">{{ r.expectedItems.toFixed(2) }} 個</span>
          <span class="sub">{{ input.itemValue ? `折算 ${fmtMeso(r.breakdown.itemMeso)}` : '未設市價，未計入總花費' }}</span>
        </div>
      </div>
      <div class="breakdown">
        <span>強化費 <b>{{ fmtMeso(r.breakdown.forge) }}</b></span>
        <span>＋ 復原楓幣 <b>{{ fmtMeso(r.breakdown.restoreMeso) }}</b></span>
        <span v-if="r.breakdown.scroll">＋ 卷軸 <b>{{ fmtMeso(r.breakdown.scroll) }}</b></span>
        <span>＋ 道具折算 <b>{{ fmtMeso(r.breakdown.itemMeso) }}</b></span>
        <span>＝ <b class="total">{{ fmtMeso(r.breakdown.total) }}</b></span>
      </div>
    </section>

    <section class="panel">
      <h2>逐星建議</h2>
      <p v-if="safeguardSkipped" class="hint">防止破壞已納入評估，但在目前價格參數下不划算，各星皆未採用。</p>
      <p v-if="policyRows.some((p) => p.belowStart)" class="hint">
        灰色列為起始星以下：只有破壞後「重新開始」才會經過的路徑。
      </p>
      <div class="scroll-x">
        <table class="grid">
          <thead>
            <tr>
              <th>星階</th>
              <th>成功率</th>
              <th>建議動作</th>
              <th>破壞時處理</th>
              <th>剩餘期望花費</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in policyRows" :key="p.star" :class="{ below: p.belowStart }">
              <td class="lv">{{ p.star }}★ → {{ p.star + 1 }}★</td>
              <td>{{ fmtPct(p.success) }}</td>
              <td class="act">{{ ACTION_LABEL[p.action.type] ?? p.action.type }}</td>
              <td>{{ p.repair ? REPAIR_LABEL[p.repair] : '—' }}</td>
              <td>{{ fmtMeso(p.expectedCost) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </template>
</template>

<style scoped>
.panel { background: #232329; border: 1px solid #33333c; border-radius: 8px; padding: 1rem 1.2rem; margin-bottom: 1.2rem; }
.rules { color: #aaa; font-size: 0.85rem; margin: 0.4rem 0 0.8rem; padding-left: 1.1rem; }
.rules li { margin: 0.2rem 0; }
.fields { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: flex-start; }
.field { display: inline-flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #aab; }
.field.check { justify-content: center; padding-top: 1.2rem; }
select, input[type='number'] {
  background: #1a1a22; color: #eee; border: 1px solid #44444f; border-radius: 6px;
  padding: 0.35rem 0.5rem; font-size: 0.9rem; width: 12rem;
}
select { width: auto; }
.preview { color: #789; font-size: 0.75rem; }
.cards { display: flex; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
.stat { background: #2a2a33; border: 1px solid #3a3a44; border-radius: 6px; padding: 0.5rem 0.9rem; display: flex; flex-direction: column; min-width: 11rem; }
.stat .k { color: #8aa; font-size: 0.8rem; }
.stat .v { font-weight: bold; font-size: 1.2rem; }
.stat.main .v { color: #cdf; font-size: 1.4rem; }
.stat .sub { color: #888; font-size: 0.75rem; }
.breakdown { display: flex; gap: 0.8rem; flex-wrap: wrap; font-size: 0.9rem; color: #aab; }
.breakdown b { color: #eee; }
.breakdown .total { color: #cdf; font-size: 1.05rem; }
.hint { color: #888; font-size: 0.8rem; margin: 0.2rem 0 0.6rem; }
.scroll-x { overflow-x: auto; }
.grid { width: 100%; border-collapse: collapse; white-space: nowrap; }
.grid th, .grid td { border: none; border-bottom: 1px solid #33333c; padding: 0.4rem 0.6rem; text-align: right; }
.grid th { color: #99a; font-weight: 600; font-size: 0.85rem; }
.grid td { font-variant-numeric: tabular-nums; font-size: 0.85rem; }
.lv { text-align: left; white-space: nowrap; color: #cdf; }
.act { text-align: left; }
.grid td.act, .grid th:nth-child(3) { text-align: left; }
.below td { color: #666; }
.below .lv { color: #667; }
.error { color: #f88; }
</style>
