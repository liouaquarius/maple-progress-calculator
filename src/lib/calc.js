// 計算核心：均分、每週產出、以及 Destiny 跨 stage 硬上限的最小浪費排序建議。
//
// 浪費模型（已與實際遊戲規則對齊，遊戲內命名：外層 stage、內含 missions）：
// - Destiny 的 resolve 在「當前 stage」內累積；mission 1、2 為軟上限（溢出繼承到下一 mission），
//   最後一個 mission 為硬上限（= stage 各 mission 成本總和），裝不下即浪費，且不會預存給下個 stage。
// - 均分一律無條件捨去（floor）。
// - 排序最佳化僅在「當週產出會跨過硬上限（完成 stage）」時才需要。
// - daily 產出依等級取「可進入的最高區域」（取 max，不累加）。

// ── 均分 ───────────────────────────────────────────────
export function perPerson(amount, partySize) {
  return Math.floor(amount / partySize)
}

export function perPersonRewards(rewards, partySize) {
  const out = {}
  for (const [id, total] of Object.entries(rewards)) {
    out[id] = perPerson(total, partySize)
  }
  return out
}

// ── boss 難度查詢（boss.json 內含 difficulties，key 為 tier，含全域 order）──
// 取某 boss 物件的某 tier 難度
export function bossTier(boss, tier) {
  return boss?.difficulties?.find((d) => d.tier === tier)
}
// boss 的 destiny 需求 order（gate boss 才有 destiny tier）
export function destinyReqOrder(boss) {
  return bossTier(boss, 'destiny')?.order ?? null
}

// ── 每週產出 ───────────────────────────────────────────
// bossSelections: [{ boss, difficulty, partySize }]（difficulty = tier id）
// 回傳每人份合計 {resolve, battle_traces, erion_fragment}
export function bossWeeklyIncome(bossSelections, data) {
  const total = { resolve: 0, battle_traces: 0, erion_fragment: 0 }
  for (const sel of bossSelections) {
    const boss = data.bosses.find((b) => b.id === sel.boss)
    const diff = bossTier(boss, sel.difficulty)
    if (!diff) continue
    const each = perPersonRewards(diff.rewards, sel.partySize)
    for (const id in total) total[id] += each[id] ?? 0
  }
  return total
}

// 依等級取「可進入的最高區域」（req_level <= level 中 req_level 最大者）。
export function maxDailyArea(level, areas) {
  const eligible = areas.filter((a) => a.req_level <= level)
  if (!eligible.length) return null
  return eligible.reduce((hi, a) => (a.req_level > hi.req_level ? a : hi))
}

// 每日碎片量 = 最高區域的每日碎片（取 max，不累加多區域）。area.json 已內含 daily。
export function dailyErionPerDay(level, data) {
  const area = maxDailyArea(level, data.areas)
  return area?.daily?.erion_fragment ?? 0
}

// 每週 daily 碎片 = 每日碎片 × 一週天數。
export function dailyErionPerWeek(level, data, days) {
  return dailyErionPerDay(level, data) * days
}

// ── Destiny 硬上限最小浪費排序 ─────────────────────────
// 某 stage 的 resolve 硬上限 = 各 mission 成本總和。
export function stageTotal(stage) {
  return stage.missions.reduce((s, m) => s + (m.cost.resolve ?? 0), 0)
}

// ── 由「當前 stage / mission / 當前頁面數值」推導累積量 ──
// 當前 stage 內已累積的 resolve = 已完成 mission 的成本總和 + 當前 mission 已投入值。
export function resolveInStage(stage, missionIndex, currentResolve) {
  let sum = 0
  for (let i = 0; i < missionIndex; i++) sum += stage.missions[i].cost.resolve ?? 0
  return sum + currentResolve
}

// 跨所有 stage 已累積的總 resolve = 已完成 stage 全額 + 當前 stage 內已累積。
export function totalResolveAccumulated(destiny, stageIndex, missionIndex, currentResolve) {
  let sum = 0
  for (let i = 0; i < stageIndex; i++) sum += stageTotal(destiny[i])
  return sum + resolveInStage(destiny[stageIndex], missionIndex, currentResolve)
}

// Astra 痕跡的可儲存上限（碎片無上限）。實際上限 = min(依 stage 邏輯的剩餘量, 此值)。
export const ASTRA_TRACES_STORAGE_CAP = 1000

// Astra 全部 stage 的總需求。
export function astraTotals(astra) {
  return astra.reduce(
    (acc, s) => ({
      traces: acc.traces + (s.cost.battle_traces ?? 0),
      erion: acc.erion + (s.cost.erion_fragment ?? 0),
    }),
    { traces: 0, erion: 0 },
  )
}

// Astra 已累積 = 已完成 mission 全額 + 當前 mission 已投入值。
export function astraAccumulated(astra, missionIndex, currentTraces, currentErion) {
  let traces = 0
  let erion = 0
  for (let i = 0; i < missionIndex; i++) {
    traces += astra[i].cost.battle_traces ?? 0
    erion += astra[i].cost.erion_fragment ?? 0
  }
  return { traces: traces + currentTraces, erion: erion + currentErion }
}

// 在「本週要清的 boss resolve 清單」中，找出以最少浪費完成當前 stage 的方案。
//   items    : [{ boss, difficulty, resolve }]  // 每人份 resolve
//   remaining: 完成當前 stage 還差多少 resolve（= stageTotal − 目前桶內 resolve）
// 回傳 { completes, waste, before, after }
export function minWastePlan(items, remaining) {
  const totalAll = items.reduce((s, it) => s + it.resolve, 0)

  // 本週全清也到不了硬上限 → 不跨界，軟性累積、零浪費、順序無所謂。
  if (totalAll < remaining) {
    return { completes: false, waste: 0, before: [...items], after: [] }
  }

  // 列舉所有子集，取 sum ≥ remaining 且溢出最小者（boss 數少，2^n 可接受）。
  const n = items.length
  let best = null
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += items[i].resolve
    if (sum >= remaining) {
      const waste = sum - remaining
      if (best === null || waste < best.waste) best = { mask, waste }
    }
  }

  const before = []
  const after = []
  for (let i = 0; i < n; i++) {
    ;(best.mask & (1 << i) ? before : after).push(items[i])
  }
  return { completes: true, waste: best.waste, before, after }
}
