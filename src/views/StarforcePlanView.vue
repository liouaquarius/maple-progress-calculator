<script setup>
// 星力 — 強化策略計算：輸入裝等/起始/目標星與價格參數，
// 由 solveStarforce（期望成本最小化）給出期望花費、分項與逐星建議動作。
import { computed, watch, shallowRef, ref, onBeforeUnmount } from 'vue'
import { store } from '../store.js'
import { solveStarforce, createStarforceSimulator, boostedRates } from '../lib/starforce.js'
import { fmtInt, fmtMeso, fmtPct } from '../utils/format.js'

const sf = computed(() => store.data.starforce)
const input = store.starforce // reactive，直接綁定並持久化

// 該裝等可強化到的最高星（cost 非 null 的最大 star + 1）
const cap = computed(() => {
  let c = 0
  for (const s of sf.value.steps) if (s.cost[input.level] != null) c = Math.max(c, s.star + 1)
  return c
})

// 消費階級折扣（star_force.json discount）：僅套用於 max_star（含）以下的強化費
const discountTiers = computed(() => sf.value.discount?.tiers ?? [])
const vipTier = computed(() => discountTiers.value.find((t) => t.id === input.vipTier))

// ── 卷軸 ────────────────────────────────────────────────
// 目錄（star_force.json 的 scrolls）為「券種家族」：name_zh 內含 n 佔位，n ∈ [n_min, n_max]
// 每個值都是一張實際卷軸。使用者以「家族 + n + 價格」動態建立要納入評估的列表。
const scrollCatalog = computed(() => sf.value.scrolls ?? [])
const familyById = computed(() => Object.fromEntries(scrollCatalog.value.map((f) => [f.id, f])))

// 持久化資料正規化：舊形狀（物件）重置；目錄已移除的券種丟棄；n 超出現行範圍時夾回
//（券種會隨遊戲版本增減，localStorage 可能殘留舊列）
if (!Array.isArray(input.scrolls)) input.scrolls = []
input.scrolls = input.scrolls.filter((r) => familyById.value[r.family])
for (const r of input.scrolls) {
  const f = familyById.value[r.family]
  r.n = Math.min(Math.max(r.n, f.n_min), f.n_max)
}

// 名稱模板：n星 → 實際星數（如 突破1星強化券100%(n星) → …(21星)）
const scrollName = (f, n) => f.name_zh.replace('n星', `${n}星`)
// 裝等限制（追加系列限 Lv.200 以下）
const familyUsable = (f) => f.max_item_level == null || input.level <= f.max_item_level
const nOptions = (f) => Array.from({ length: f.n_max - f.n_min + 1 }, (_, i) => f.n_min + i)

const addScroll = () => {
  const f = scrollCatalog.value.find(familyUsable) ?? scrollCatalog.value[0]
  if (f) input.scrolls.push({ family: f.id, n: f.n_min, price: null, enabled: true })
}
const removeScroll = (i) => input.scrolls.splice(i, 1)
// 換家族時把 n 夾回該家族範圍
const onFamilyChange = (row) => {
  const f = familyById.value[row.family]
  if (row.n < f.n_min || row.n > f.n_max) row.n = f.n_min
}

// 有效列：勾選中、家族存在、且裝等符合限制
const activeScrollRows = computed(() =>
  input.scrolls.filter((r) => {
    const f = familyById.value[r.family]
    return r.enabled && f && familyUsable(f)
  }),
)

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

// 求解參數（solved 與模擬共用同一組，確保兩者對同一模型計算）
const solverArgs = computed(() => {
  const guaranteedScrolls = []
  const additiveScrolls = []
  for (const r of activeScrollRows.value) {
    const f = familyById.value[r.family]
    const price = r.price || 0 // 空 = 0（活動免費券）
    if (f.kind === 'guaranteed') guaranteedScrolls.push({ star: r.n, price })
    else additiveScrolls.push({ maxStar: r.n, rate: f.rate, price })
  }
  return {
    range: { level: input.level, startStar: input.startStar, targetStar: input.targetStar },
    prices: { itemValue: input.itemValue ?? 0, guaranteedScrolls, additiveScrolls },
    options: {
      safeguard: input.safeguard,
      discount: vipTier.value?.pct
        ? { costMultiplier: 1 - vipTier.value.pct / 100, maxStar: sf.value.discount.max_star }
        : null,
    },
  }
})

const solved = computed(() => {
  const { range, prices, options } = solverArgs.value
  try {
    return { result: solveStarforce(sf.value, range, prices, options), error: null }
  } catch (e) {
    return { result: null, error: e.message }
  }
})
const r = computed(() => solved.value.result)

// 逐星策略表（含加成後成功率；起始星以下 = 破壞重來後才會走到的路徑）
const stepByStar = computed(() => new Map(sf.value.steps.map((s) => [s.star, s])))
// 卷軸動作以實際卷軸名稱顯示：依參數反查啟用列，同參數多列時取最便宜者
//（solver 對相同 maxStar/rate 只會採用最低價，如 突破100%(21) 與 追加100%(21) 並列時）。
const cheapestRow = (pred) =>
  activeScrollRows.value.filter(pred).sort((a, b) => (a.price || 0) - (b.price || 0))[0]
const actionLabel = (a) => {
  if (a.type === 'normal') return '正常強化'
  if (a.type === 'safeguard') return '防止破壞（費用 ×3）'
  if (a.type === 'guaranteed') {
    const row = cheapestRow((r) => familyById.value[r.family].kind === 'guaranteed' && r.n === a.star)
    return row ? scrollName(familyById.value[row.family], row.n) : `必成卷軸（→${a.star}★）`
  }
  if (a.type === 'additive') {
    const row = cheapestRow((r) => {
      const f = familyById.value[r.family]
      return f.kind === 'additive' && r.n === a.maxStar && f.rate === a.rate
    })
    return row ? scrollName(familyById.value[row.family], row.n) : '追加卷軸'
  }
  return a.type
}
// 破壞處理標籤：落點依資料計算（restore 超過上限星時回上限星，如 23★ 破壞 → 回 22★）
const repairLabel = (p) => {
  if (!p.repair) return '—'
  if (p.repair === 'restart') return `重新開始（回 ${sf.value.repair.restart.start_star}★）`
  return `復原（回 ${Math.min(p.star, sf.value.repair.restore.max_star)}★）`
}
const policyRows = computed(() =>
  (r.value?.policy ?? []).map((p) => ({
    ...p,
    success: boostedRates(stepByStar.value.get(p.star).rates).success,
    belowStart: p.star < input.startStar,
  })),
)

// 分項堆疊比例條：固定色序（藍/青/黃/綠，已對 #232329 面板底驗證 CVD 與對比），
// 顏色跟隨分項本身、不隨數量重排；0 值分項不畫段、圖例同步省略。
const BREAKDOWN_PARTS = [
  { key: 'forge', label: '強化費', color: '#3987e5' },
  { key: 'restoreMeso', label: '復原楓幣', color: '#199e70' },
  { key: 'scroll', label: '卷軸', color: '#c98500' },
  { key: 'itemMeso', label: '道具折算', color: '#008300' },
]
const breakdownSegs = computed(() => {
  const b = r.value?.breakdown
  if (!b?.total) return []
  return BREAKDOWN_PARTS.filter((p) => b[p.key] > 0).map((p) => ({
    ...p,
    value: b[p.key],
    pct: (b[p.key] / b.total) * 100,
  }))
})

// ── 花費分布（蒙地卡羅模擬）────────────────────────────
// 沿最優策略抽樣總花費；固定 seed 使同輸入結果可重現。
// run 數依期望強化次數自動調整（總步數預算 2e7）；期望次數過高（如 29/30★）則不模擬。
// 以 12ms 分塊執行避免阻塞 UI；輸入變更 debounce 300ms 後重跑，舊工作即時取消。
const SIM_PCTS = [10, 25, 50, 75, 90, 99]
const SIM_BINS = 50
// 破壞次數分組（0/1/2/3/4+）：分布左側的峰谷即來自這些混合成分。
// 有序量 → 單色 ordinal ramp（淺→深 = 少→多），已對 #232329 面板底驗證。
const GROUP_COLORS = ['#b7d3f6', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab']
const GROUP_LABELS = ['破壞 0 次', '1 次', '2 次', '3 次', '4 次以上']
const sim = shallowRef(null) // null = 模擬中；{ skipped } 或結果物件
const myCost = ref(null)
let simTimer = 0
let simJob = null

const quantile = (a, q) => {
  const pos = (a.length - 1) * q
  const lo = Math.floor(pos)
  return a[lo] + (a[Math.ceil(pos)] - a[lo]) * (pos - lo)
}
// 排序陣列中 ≤ x 的個數（二分搜）
const countLE = (a, x) => {
  let lo = 0
  let hi = a.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (a[m] <= x) lo = m + 1
    else hi = m
  }
  return lo
}

const finishSim = (costs, destroys, res) => {
  const runs = costs.length
  const sorted = Float64Array.from(costs).sort()
  const lo = sorted[0]
  const hi = quantile(sorted, 0.99) // P99 截尾，避免極端尾巴壓扁主體
  const nG = GROUP_COLORS.length
  const groupShare = new Array(nG).fill(0)
  for (let i = 0; i < runs; i++) groupShare[Math.min(destroys[i], nG - 1)]++
  let bins = null
  let maxCount = 0
  if (hi > lo) {
    const w = (hi - lo) / SIM_BINS
    bins = Array.from({ length: SIM_BINS }, (_, b) => ({
      total: 0,
      parts: new Array(nG).fill(0), // 依破壞次數分組的堆疊
      from: lo + w * b,
      to: lo + w * (b + 1),
    }))
    for (let i = 0; i < runs; i++) {
      if (costs[i] > hi) continue
      const bin = bins[Math.min(SIM_BINS - 1, Math.floor((costs[i] - lo) / w))]
      bin.total++
      bin.parts[Math.min(destroys[i], nG - 1)]++
    }
    maxCount = Math.max(...bins.map((b) => b.total))
  }
  const posOf = (v) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))
  sim.value = {
    runs,
    samples: sorted,
    groupShare: groupShare.map((c) => c / runs),
    pcts: SIM_PCTS.map((p) => ({ p, value: quantile(sorted, p / 100) })),
    meanPR: (countLE(sorted, res.expectedMeso) / runs) * 100,
    expected: res.expectedMeso,
    lo,
    hi,
    bins,
    maxCount,
    markers: bins
      ? [
          { label: 'P50', pos: posOf(quantile(sorted, 0.5)), dashed: false },
          { label: 'P90', pos: posOf(quantile(sorted, 0.9)), dashed: false },
          { label: '期望', pos: posOf(res.expectedMeso), dashed: true },
        ]
      : null,
  }
}

// bin 的 hover 說明：區間、總占比、破壞次數明細（只列非零組）
const binTitle = (b) => {
  const head = `${fmtMeso(b.from)} ~ ${fmtMeso(b.to)}：${b.total} 次（${((b.total / sim.value.runs) * 100).toFixed(1)}%）`
  const parts = b.parts
    .map((c, g) => (c ? `${GROUP_LABELS[g]} ${c}` : null))
    .filter(Boolean)
    .join('、')
  return parts ? `${head}\n${parts}` : head
}

const startSim = () => {
  const res = solved.value.result
  if (!res || !res.policy.length) return
  const runs = Math.min(20000, Math.floor(2e7 / Math.max(1, res.expectedAttempts)))
  if (runs < 2000) {
    sim.value = { skipped: true, attempts: res.expectedAttempts }
    return
  }
  const { range, prices, options } = solverArgs.value
  const { runOne } = createStarforceSimulator(sf.value, range, prices, options)
  const costs = new Float64Array(runs)
  const destroys = new Uint16Array(runs)
  const job = { cancelled: false }
  simJob = job
  let i = 0
  const chunk = () => {
    if (job.cancelled) return
    const deadline = performance.now() + 12
    while (i < runs && performance.now() < deadline) {
      const r = runOne()
      costs[i] = r.cost
      destroys[i] = Math.min(r.destroys, 65535)
      i++
    }
    if (i < runs) {
      setTimeout(chunk, 0)
      return
    }
    finishSim(costs, destroys, res)
  }
  chunk()
}

watch(
  solved,
  () => {
    clearTimeout(simTimer)
    if (simJob) simJob.cancelled = true
    sim.value = null
    simTimer = setTimeout(startSim, 300)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  clearTimeout(simTimer)
  if (simJob) simJob.cancelled = true
})

// 反查 PR：PR n ＝ n% 的模擬花費 ≤ 該值（越低越幸運）
const myPR = computed(() => {
  const s = sim.value
  if (!s?.samples || !myCost.value || myCost.value <= 0) return null
  return (countLE(s.samples, myCost.value) / s.runs) * 100
})
// 「你」在直方圖上的位置（超出 P99 時貼齊右緣）
const myMarkerPos = computed(() => {
  const s = sim.value
  if (!s?.bins || !myCost.value || myCost.value <= 0) return null
  return Math.min(100, Math.max(0, ((myCost.value - s.lo) / (s.hi - s.lo)) * 100))
})

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
      <label v-if="discountTiers.length" class="field">
        消費階級（強化費折扣）
        <select v-model="input.vipTier">
          <option v-for="t in discountTiers" :key="t.id" :value="t.id">
            {{ t.name_zh }}{{ t.pct ? `（${t.pct}%）` : '' }}
          </option>
        </select>
        <span class="preview">折扣僅套用 {{ sf.discount.max_star }}★（含）以下的強化費</span>
      </label>
      <label class="field check">
        <span><input v-model="input.safeguard" type="checkbox" /> 允許防止破壞（15–17★）</span>
        <span class="preview">划算時才會被採用</span>
      </label>
    </div>

    <details v-if="scrollCatalog.length" class="scrolls" :open="input.scrolls.length > 0">
      <summary>卷軸（進階）{{ input.scrolls.length ? `— 已列 ${input.scrolls.length} 張` : '' }}</summary>
      <p class="hint">
        卷軸視為可無限量取得（抽獎產出但玩家間交易量充足），僅以單價評估是否划算；划算時才會被採用。
        必成券的星數＝直上目標；突破／追加券的星數＝可用上限（低於該星時可用，成功 +1 星、失敗維持）。
        「追加」系列僅限 Lv.200（含）以下裝備。
      </p>
      <div class="scroll-rows">
        <div v-for="(row, i) in input.scrolls" :key="i" class="scroll-row">
          <input v-model="row.enabled" type="checkbox" title="納入評估" />
          <select v-model="row.family" @change="onFamilyChange(row)">
            <option v-for="f in scrollCatalog" :key="f.id" :value="f.id">{{ f.name_zh }}</option>
          </select>
          <select v-model.number="row.n">
            <option v-for="n in nOptions(familyById[row.family])" :key="n" :value="n">{{ n }}★</option>
          </select>
          <input
            v-model.number="row.price"
            type="number" min="0" step="10000000"
            placeholder="價格（楓幣/張），空 = 0"
            :disabled="!row.enabled"
          />
          <span class="preview">{{ row.price ? `≈ ${fmtMeso(row.price)}` : '' }}</span>
          <span v-if="!familyUsable(familyById[row.family])" class="warn">
            限 Lv.{{ familyById[row.family].max_item_level }} 以下，Lv.{{ input.level }} 不適用（未計入）
          </span>
          <button class="rm" title="移除" @click="removeScroll(i)">✕</button>
        </div>
        <button class="add" @click="addScroll">＋ 新增卷軸</button>
      </div>
    </details>
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
      <div v-if="breakdownSegs.length" class="stackbar">
        <div
          v-for="s in breakdownSegs"
          :key="s.key"
          class="seg"
          :style="{ width: s.pct + '%', background: s.color }"
          :title="`${s.label} ${fmtMeso(s.value)}（${s.pct.toFixed(1)}%）`"
        />
      </div>
      <div class="breakdown">
        <template v-for="(s, i) in breakdownSegs" :key="s.key">
          <span>
            {{ i ? '＋ ' : '' }}<i class="dot" :style="{ background: s.color }" />{{ s.label }}
            <b>{{ fmtMeso(s.value) }}</b>
            <span class="pct">{{ s.pct.toFixed(1) }}%</span>
          </span>
        </template>
        <span>＝ <b class="total">{{ fmtMeso(r.breakdown.total) }}</b></span>
      </div>
    </section>

    <section class="panel">
      <h2>花費分布（模擬）</h2>
      <p v-if="!sim" class="hint">模擬中…</p>
      <p v-else-if="sim.skipped" class="hint">
        此目標的期望強化次數約 {{ fmtInt(sim.attempts) }} 次/趟，模擬成本過高，不提供分布（上方期望值仍為精確解）。
      </p>
      <template v-else>
        <div class="pcts">
          <div v-for="x in sim.pcts" :key="x.p" class="stat small">
            <span class="k">PR {{ x.p }}</span>
            <span class="v">{{ fmtMeso(x.value) }}</span>
          </div>
        </div>

        <template v-if="sim.bins">
          <div class="histo">
            <div class="bars">
              <div
                v-for="(b, i) in sim.bins"
                :key="i"
                class="bin"
                :style="{ height: (b.total / sim.maxCount) * 100 + '%' }"
                :title="binTitle(b)"
              >
                <template v-for="(p, g) in b.parts" :key="g">
                  <div v-if="p" class="seg" :style="{ flexGrow: p, background: GROUP_COLORS[g] }" />
                </template>
              </div>
            </div>
            <div v-for="m in sim.markers" :key="m.label" class="marker" :class="{ dashed: m.dashed }" :style="{ left: m.pos + '%' }">
              <span class="mlabel">{{ m.label }}</span>
            </div>
            <div v-if="myMarkerPos != null" class="marker my" :style="{ left: myMarkerPos + '%' }">
              <span class="mlabel">你{{ myCost > sim.hi ? '（>P99）' : '' }}</span>
            </div>
          </div>
          <div class="axis">
            <span>{{ fmtMeso(sim.lo) }}</span>
            <span>{{ fmtMeso(sim.hi) }}（P99 截尾）</span>
          </div>
          <div class="legend">
            <span class="legend-title">顏色＝該趟破壞次數：</span>
            <span v-for="(label, g) in GROUP_LABELS" :key="g" class="legend-item">
              <i class="dot" :style="{ background: GROUP_COLORS[g] }" />{{ label }}
              <span class="pct">{{ (sim.groupShare[g] * 100).toFixed(0) }}%</span>
            </span>
          </div>
        </template>
        <p v-else class="hint">此設定下花費恆為 {{ fmtMeso(sim.lo) }}，無分布。</p>

        <p class="hint">
          模擬 {{ fmtInt(sim.runs) }} 次（固定亂數種子）。PR n ＝ n% 的模擬花費 ≤ 該值。
          期望值 {{ fmtMeso(sim.expected) }} 約在 <b>PR {{ sim.meanPR.toFixed(0) }}</b>——重尾分布下期望值高於中位數（PR 50）。
          左側的多個峰對應「破壞 0 次／1 次／2 次…」的花費群（每次破壞的救回成本是一大塊固定量級）；破壞越多次成分彼此重疊，右側便融合成平滑長尾。
        </p>

        <label class="field">
          我的花費（楓幣）
          <input v-model.number="myCost" type="number" min="0" step="1000000" placeholder="輸入實際花費查 PR" />
          <span v-if="myCost" class="preview">≈ {{ fmtMeso(myCost) }}</span>
        </label>
        <p v-if="myPR != null" class="mypr">
          你的花費 ≈ <b>PR {{ myPR.toFixed(1) }}</b>：約 {{ (100 - myPR).toFixed(1) }}% 的模擬花費比你多（PR 越低越幸運）。
        </p>
      </template>
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
              <td class="act">{{ actionLabel(p.action) }}</td>
              <td>{{ repairLabel(p) }}</td>
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
.scrolls { margin-top: 1rem; }
.scrolls summary { cursor: pointer; color: #aab; font-size: 0.9rem; user-select: none; }
.scrolls summary:hover { color: #cdf; }
.scroll-rows { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.6rem; align-items: flex-start; }
.scroll-row { display: flex; gap: 0.6rem; align-items: center; font-size: 0.85rem; flex-wrap: wrap; }
.scroll-row input[type='number'] { width: 12rem; }
.scroll-row input[type='number']:disabled { opacity: 0.4; }
.scroll-row .preview { min-width: 4rem; }
.warn { color: #e0a060; font-size: 0.8rem; }
.rm {
  background: transparent; color: #866; border: 1px solid #3a3a44; border-radius: 6px;
  padding: 0.15rem 0.5rem; cursor: pointer; font-size: 0.8rem;
}
.rm:hover { background: #3a2a2a; color: #d88; }
.add {
  background: transparent; color: #aab; border: 1px dashed #44444f; border-radius: 6px;
  padding: 0.3rem 0.9rem; cursor: pointer; font-size: 0.85rem;
}
.add:hover { background: #2a2a33; color: #cdf; }
.cards { display: flex; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
.stat { background: #2a2a33; border: 1px solid #3a3a44; border-radius: 6px; padding: 0.5rem 0.9rem; display: flex; flex-direction: column; min-width: 11rem; }
.stat .k { color: #8aa; font-size: 0.8rem; }
.stat .v { font-weight: bold; font-size: 1.2rem; }
.stat.main .v { color: #cdf; font-size: 1.4rem; }
.stat .sub { color: #888; font-size: 0.75rem; }
/* 分項堆疊比例條：2px 表面間隙分隔段、細條、容器圓角 */
.stackbar { display: flex; gap: 2px; height: 14px; max-width: 640px; border-radius: 4px; overflow: hidden; margin-bottom: 0.55rem; }
.stackbar .seg { min-width: 3px; }
.breakdown { display: flex; gap: 0.8rem; flex-wrap: wrap; font-size: 0.9rem; color: #aab; align-items: baseline; }
.breakdown b { color: #eee; }
.breakdown .total { color: #cdf; font-size: 1.05rem; }
.breakdown .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 0.3rem; }
.breakdown .pct { color: #778; font-size: 0.75rem; margin-left: 0.15rem; }
.hint { color: #888; font-size: 0.8rem; margin: 0.2rem 0 0.6rem; }
/* 花費分布：百分位卡、直方圖（div bar + 參考線）、反查 PR */
.pcts { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
.stat.small { min-width: 6.5rem; padding: 0.35rem 0.7rem; }
.stat.small .v { font-size: 1rem; }
.histo { position: relative; max-width: 640px; height: 132px; padding-top: 16px; margin-top: 0.4rem; }
.bars { display: flex; align-items: flex-end; gap: 1px; height: 100%; border-bottom: 1px solid #383835; }
/* 每根 bin 內以破壞次數堆疊（column-reverse：0 次在底、次數越多越上層） */
.bin { flex: 1; display: flex; flex-direction: column-reverse; border-radius: 2px 2px 0 0; overflow: hidden; }
.bin .seg { flex-basis: 0; }
.marker { position: absolute; top: 0; bottom: 0; border-left: 1px solid #898781; pointer-events: none; }
.marker.dashed { border-left-style: dashed; border-left-color: #aab; }
.marker.my { border-left-color: #c98500; }
.marker.my .mlabel { color: #c98500; top: 12px; }
.mlabel { position: absolute; top: -2px; left: 3px; font-size: 0.7rem; color: #99a; white-space: nowrap; }
.axis { display: flex; justify-content: space-between; max-width: 640px; color: #778; font-size: 0.75rem; margin: 0.3rem 0 0.4rem; }
.legend { display: flex; gap: 0.9rem; flex-wrap: wrap; align-items: baseline; font-size: 0.8rem; color: #aab; margin-bottom: 0.6rem; }
.legend-title { color: #889; }
.legend-item { display: inline-flex; align-items: baseline; gap: 0.25rem; }
.legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }
.legend .pct { color: #778; font-size: 0.72rem; }
.mypr { font-size: 0.9rem; color: #aab; margin-top: 0.5rem; }
.mypr b { color: #cdf; }
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
