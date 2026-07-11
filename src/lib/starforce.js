// 星力強化核心邏輯：常駐成功率加成、破壞後救回方式、策略求解（期望成本最小化）。
//
// 資料來源：refs/star_force.json
//   - steps[]：每星階段的原始 rates（success / destroy / maintain）與各裝等 cost。
//   - repair：破壞後救回設定（restart 從 12★ 重來；restore 花道具＋楓幣回到破壞星數）。
//
// 機率精確性：原始 rates 不在 JSON 內被加成（見 star_force.json 保持原值），
// 常駐 1.05 倍成功率一律在此以 JS 計算，避免預先四捨五入造成誤差。

// 常駐成功率加成倍率。
export const SUCCESS_MULTIPLIER = 1.05

// 套用常駐成功率加成：
//   成功率 ×multiplier；剩餘機率（1 − 新成功率）在 destroy:maintain 的「原比例」下等比例縮放。
//   例：原 success/destroy/maintain = 0.2/0.2/0.6，×1.05 後 = 0.21/0.1975/0.5925。
export function boostedRates(rates, multiplier = SUCCESS_MULTIPLIER) {
  const success = Math.min(1, rates.success * multiplier)
  const rest = 1 - success
  const base = rates.destroy + rates.maintain
  if (base <= 0) return { success, destroy: 0, maintain: rest }
  const k = rest / base
  return { success, destroy: rates.destroy * k, maintain: rates.maintain * k }
}

// 破壞後的兩種救回方式（destroyStar = 破壞時所在星數，即嘗試 destroyStar★→+1 時破壞）。
//   restart：花 1 個相同道具，從 12★ 重新開始（無楓幣、任何裝等皆可）。
//   restore：花對應道具數＋楓幣，回到破壞星數；上限為 restore.max_star（22★），
//            破壞星數超過上限時只能回到上限星（如 23★ 破壞 → 回 22★）。
//            部分裝等（如 130）無 restore 資料，則僅提供 restart。
// 回傳陣列（restart 一定在，restore 視資料而定），每項：{ method, resultStar, items, meso }。
export function repairOptions(destroyStar, level, repair) {
  const options = [
    {
      method: 'restart',
      resultStar: repair.restart.start_star,
      items: repair.restart.items,
      meso: 0,
    },
  ]

  const cap = repair.restore.max_star
  const restoreStar = Math.min(destroyStar, cap)
  const entry = repair.restore.by_level[String(level)]?.[String(restoreStar)]
  if (entry) {
    options.push({
      method: 'restore',
      resultStar: restoreStar,
      items: entry.items,
      meso: entry.meso,
    })
  }

  return options
}

// ── 策略求解（期望強化成本最小化）────────────────────────────
//
// 把「將 level 道具從 startStar 強化到 targetStar」建模成隨機最短路徑：
// 狀態 = 當前星數，目標 = 最小化期望總成本（meso）。每個星有一組「動作」，
// DP 逐星取期望成本最低者。動作以「base（每次嘗試無條件費用）＋ successors（分支）」表示，
// 每條分支帶自己的機率與 add（僅該分支發生的即時費用，如破壞才付的 restore）：
//
//   normal（正常強化）    base.forge c(k) ：成功 p→k+1 / 維持 f→k / 破壞 d→restart|restore
//   safeguard（15/16/17） base.forge 3c(k)：成功 p→k+1 / (f+d)→k / 破壞 0
//   additive（追加卷軸）  base.scroll price：成功 rate→k+1 / (1−rate)→k / 破壞 0（k<maxStar）
//   guaranteed（必成卷軸）base.scroll price：確定跳躍 →star（無視當前星，k<star≤cap）
//
// 破壞分支（僅機率 d 時付）二選一：
//   restart：add.items=1，落點 12★         restore：add.restoreMeso=meso, add.items，落點 min(k,22)★
//
// 起始道具不計底價（sunk）；破壞消耗的新道具、卷軸才計費，皆折算成 meso 供比較。
// 費用分項：forge（強化費）/ restoreMeso（restore 楓幣）/ scroll（卷軸費）/ items（道具「數量」）。
// G(k) 自我參照（維持、restore 回原星）＋外層 min 為非線性，故用 value iteration。
// 求得最優策略後，同一引擎（固定策略下的線性期望）再解各分項與道具數，
// 各分項折算 meso 之和恆等於總期望（自我驗證）。

const MAX_ITER = 20000
const TOL = 1e-9
const ZERO = { forge: 0, restoreMeso: 0, scroll: 0, items: 0 }

// 回傳 {
//   expectedMeso,                     // 期望總成本（= breakdown.total）
//   expectedItems,                    // 期望消耗 repair 道具數
//   breakdown: { forge, restoreMeso, scroll, itemMeso, total },
//   levelCap, converged,
//   policy: [ { star, action, repair, expectedCost } ]  // expectedCost = 該星到 target 剩餘期望總成本
// }
//   prices  = { itemValue, guaranteedScrolls:[{star,price}], additiveScrolls:[{maxStar,rate,price}] }
//   options = { safeguard=true, discount:{ costMultiplier, maxStar } | null }
//             discount 僅套用於 star <= maxStar 的強化費（如消費階級折扣限 16★ 以下）；maxStar 省略 = 全星階
export function solveStarforce(sf, { level, startStar, targetStar }, prices = {}, options = {}) {
  const lv = String(level)
  const V = prices.itemValue ?? 0
  const guaranteed = prices.guaranteedScrolls ?? []
  const additive = prices.additiveScrolls ?? []
  const useSafeguard = options.safeguard !== false
  const costMul = options.discount?.costMultiplier ?? 1
  const discountMaxStar = options.discount?.maxStar ?? Infinity // 折扣適用的最高星（含）

  const levels = sf.meta?.item_levels ?? []
  if (levels.length && !levels.includes(level)) {
    throw new Error(`裝等 ${level} 不在資料表（${levels.join('/')}）`)
  }

  const stepByStar = new Map(sf.steps.map((s) => [s.star, s]))

  // level cap：可正常強化到的最高星（cost 非 null 的最大 star + 1）
  let cap = 0
  for (const s of sf.steps) if (s.cost[lv] != null) cap = Math.max(cap, s.star + 1)
  if (targetStar > cap) throw new Error(`目標 ${targetStar}★ 超過裝等 ${level} 上限 ${cap}★`)

  const emptyBreakdown = { forge: 0, restoreMeso: 0, scroll: 0, itemMeso: 0, total: 0 }
  if (startStar >= targetStar) {
    return { expectedMeso: 0, expectedItems: 0, breakdown: emptyBreakdown, levelCap: cap, converged: true, policy: [] }
  }

  const restartStar = sf.repair.restart.start_star
  const restartItems = sf.repair.restart.items
  const restoreCap = sf.repair.restore.max_star
  const restoreByStar = sf.repair.restore.by_level[lv] ?? null

  // restart 會退回 12★，故狀態需涵蓋 min(startStar,12)…target
  const lo = Math.min(startStar, restartStar)

  const info = new Map()
  for (let k = lo; k < targetStar; k++) {
    const step = stepByStar.get(k)
    info.set(k, {
      rates: boostedRates(step.rates),
      cost: step.cost[lv] != null ? step.cost[lv] * (k <= discountMaxStar ? costMul : 1) : null, // null → k≥cap，不能正常強化
    })
  }

  const mesoOf = (x) => x.forge + x.restoreMeso + x.scroll + x.items * V

  const G = new Array(targetStar + 1).fill(0)
  const Gat = (s) => (s >= targetStar ? 0 : G[s]) // 達標/超過視為 0
  const chosen = new Map() // star → cell

  // 建 cell：計算 selfProb（successors 中落點 == 自己的機率總和）。
  const makeCell = (k, action, repair, base, successors) => {
    let selfProb = 0
    for (const s of successors) if (s.star === k) selfProb += s.prob
    return { action, repair, base: { ...ZERO, ...base }, successors, selfProb }
  }

  // 以當前 G 評估 cell 的期望總成本（含維持/自環折疊）。
  const evalCell = (k, c) => {
    let num = mesoOf(c.base)
    for (const s of c.successors) num += s.prob * (mesoOf(s.add) + (s.star === k ? 0 : Gat(s.star)))
    return num / (1 - c.selfProb)
  }

  // 列舉某星所有可用動作，回傳期望總成本最低者。
  const bestAction = (k) => {
    const { rates, cost } = info.get(k)
    const { success: p, maintain: f, destroy: d } = rates
    let best = Infinity
    let cell = null
    const consider = (c) => {
      const total = evalCell(k, c)
      if (total < best) { best = total; cell = c }
    }

    // normal
    if (cost != null) {
      const successors = [
        { star: k + 1, prob: p, add: ZERO },
        { star: k, prob: f, add: ZERO }, // 維持
      ]
      let repair = null
      if (d > 0) {
        const rStar = Math.min(k, restoreCap)
        const entry = restoreByStar?.[String(rStar)]
        const restartCont = restartItems * V + Gat(restartStar)
        const restoreCont = entry ? entry.items * V + entry.meso + Gat(rStar) : Infinity
        if (restoreCont < restartCont) {
          repair = 'restore'
          successors.push({ star: rStar, prob: d, add: { ...ZERO, restoreMeso: entry.meso, items: entry.items } })
        } else {
          repair = 'restart'
          successors.push({ star: restartStar, prob: d, add: { ...ZERO, items: restartItems } })
        }
      }
      consider(makeCell(k, { type: 'normal' }, repair, { forge: cost }, successors))
    }
    // safeguard（僅 15/16/17；維持機率 f+d，破壞 0）
    if (useSafeguard && cost != null && k >= 15 && k <= 17 && p > 0) {
      consider(makeCell(k, { type: 'safeguard' }, null, { forge: 3 * cost }, [
        { star: k + 1, prob: p, add: ZERO },
        { star: k, prob: f + d, add: ZERO },
      ]))
    }
    // additive（追加卷軸）
    for (const s of additive) {
      if (k < s.maxStar && k + 1 <= cap && s.rate > 0) {
        consider(makeCell(k, { type: 'additive', maxStar: s.maxStar, rate: s.rate }, null, { scroll: s.price }, [
          { star: k + 1, prob: s.rate, add: ZERO },
          { star: k, prob: 1 - s.rate, add: ZERO },
        ]))
      }
    }
    // guaranteed（必成卷軸，確定跳躍至 star）
    for (const s of guaranteed) {
      if (k < s.star && s.star <= cap) {
        consider(makeCell(k, { type: 'guaranteed', star: s.star }, null, { scroll: s.price }, [
          { star: s.star, prob: 1, add: ZERO },
        ]))
      }
    }
    return { best, cell }
  }

  // 主 value iteration：求 G 與最優策略
  let converged = false
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxDelta = 0
    for (let k = targetStar - 1; k >= lo; k--) {
      const { best, cell } = bestAction(k)
      maxDelta = Math.max(maxDelta, Math.abs(best - G[k]))
      G[k] = best
      chosen.set(k, cell)
    }
    if (maxDelta < TOL * (1 + Math.abs(G[lo]))) { converged = true; break }
  }

  // 固定策略下解某分項（reward）的期望：F(k) = [base + Σ prob·(add + F(next非self))] / (1-selfProb)
  const expectBy = (reward) => {
    const F = new Array(targetStar + 1).fill(0)
    const at = (s) => (s >= targetStar ? 0 : F[s])
    for (let iter = 0; iter < MAX_ITER; iter++) {
      let maxDelta = 0
      for (let k = targetStar - 1; k >= lo; k--) {
        const c = chosen.get(k)
        let num = c.base[reward]
        for (const s of c.successors) num += s.prob * (s.add[reward] + (s.star === k ? 0 : at(s.star)))
        const val = num / (1 - c.selfProb)
        maxDelta = Math.max(maxDelta, Math.abs(val - F[k]))
        F[k] = val
      }
      if (maxDelta < TOL * (1 + Math.abs(F[lo]))) break
    }
    return F[startStar]
  }

  const forge = expectBy('forge')
  const restoreMeso = expectBy('restoreMeso')
  const scroll = expectBy('scroll')
  const expectedItems = expectBy('items')
  const itemMeso = expectedItems * V
  const total = forge + restoreMeso + scroll + itemMeso

  const policy = [...chosen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([star, c]) => ({ star, action: c.action, repair: c.repair, expectedCost: G[star] }))

  return {
    expectedMeso: G[startStar],
    expectedItems,
    breakdown: { forge, restoreMeso, scroll, itemMeso, total },
    levelCap: cap,
    converged,
    policy,
  }
}
