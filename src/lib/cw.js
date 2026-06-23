// Challengers World S3 計分與雙向對照邏輯。
//
// 計分規則：
//  - 等級分數為「累加制」：達到等級 L 即取得 260..L 每一級的分數總和。
//  - boss 分數為「mission 制」，每筆只計一次，並可「向下累計」：
//      (0-3) 同名 boss：完成某難度 → 同名中難度 ≤ 此者一併視為完成（即使同分，如 Cygnus easy/normal 皆 100）。
//      (0-4) 跨名 boss：完成分數 P 者 → 所有分數「嚴格小於」P 的 boss 一併視為完成。
//    因此玩家只需指定「計畫完成的最高一隻 boss」即可推得 boss 總分。
//  - 段位除分數外另有硬性門檻（cw_s3_tier.boss_clear_require）：
//      Master 需通關 Normal Kai、Challenger 需通關 Hard Kai。
//      分數達標但未通關對應 Kai 時，段位被壓到下一階。
//  - 入場限制：每個 boss 難度有 entry_level，玩家等級未達者「無法入場」，
//      其分數不可計入（如 Lv260 無法打入場等級 265 的 Watcher Kalos）。

// ---- 等級 ----

// 由 levels（[{level, challengers_points}]）建立 level -> 累加分數 的對照。
export function buildLevelPrefix(levels) {
  const sorted = [...levels].sort((a, b) => a.level - b.level)
  const prefix = new Map()
  let acc = 0
  for (const { level, challengers_points } of sorted) {
    acc += challengers_points
    prefix.set(level, acc)
  }
  return prefix
}

// 取得等級 L 的累加分數；超出資料範圍時取最接近的下界。
export function levelPoints(prefix, level) {
  if (prefix.has(level)) return prefix.get(level)
  let best = 0
  for (const [lv, pts] of prefix) if (lv <= level && pts > best) best = pts
  return best
}

// ---- boss ----

// 攤平所有 boss 難度為 [{bossId, bossName, tier, points, idx, entryLevel}]（idx = 該 boss difficulties 內索引）。
export function flattenBossEntries(bosses) {
  const out = []
  for (const b of bosses) {
    b.difficulties.forEach((d, idx) => {
      out.push({
        bossId: b.id,
        bossName: b.name_zh ?? b.name,
        tier: d.tier,
        points: d.challengers_points,
        idx,
        entryLevel: d.entry_level ?? null,
      })
    })
  }
  return out
}

const entryKey = (bossId, tier) => `${bossId}:${tier}`

// 玩家在 level 是否能入場（無 entry_level 視為不限）。
const reachable = (entryLevel, level) => entryLevel == null || entryLevel <= level

// 所有分數嚴格小於 p、且該 level 可入場的 boss 難度分數小計。
function sumBelow(bosses, p, level = Infinity) {
  let s = 0
  for (const e of flattenBossEntries(bosses)) {
    if (e.points < p && reachable(e.entryLevel, level)) s += e.points
  }
  return s
}

// 完成「frontier（最高一隻 boss 的某難度）」後，向下累計涵蓋的集合與總分。
// frontier = {bossId, tier} 或 null（不打 boss）。
// level：玩家等級，無法入場（entry_level > level）者不計分、不納入完成集合。
// 回傳另含 self（frontier 對應 entry）與 frontierReachable（frontier 本身能否入場）。
export function frontierClosure(bosses, frontier, level = Infinity) {
  if (!frontier) return { points: 0, cleared: new Set(), self: null, frontierReachable: true }
  const entries = flattenBossEntries(bosses)
  const self = entries.find((e) => e.bossId === frontier.bossId && e.tier === frontier.tier)
  if (!self) return { points: 0, cleared: new Set(), self: null, frontierReachable: true }
  const cleared = new Set()
  let points = 0
  for (const e of entries) {
    const sameBossLower = e.bossId === self.bossId && e.idx <= self.idx // 0-3
    const strictlyLess = e.points < self.points // 0-4
    if ((sameBossLower || strictlyLess) && reachable(e.entryLevel, level)) {
      cleared.add(entryKey(e.bossId, e.tier))
      points += e.points
    }
  }
  return { points, cleared, self, frontierReachable: reachable(self.entryLevel, level) }
}

// 某 boss 難度是否在 frontier 的完成集合內。
export function isCleared(bosses, frontier, bossId, tier) {
  return frontierClosure(bosses, frontier).cleared.has(entryKey(bossId, tier))
}

// 找出「達成 needed boss 分數」所需的最低 frontier（最高那隻 boss）。
// 回傳：
//   {kind:'none'}                          → needed <= 0，不需 boss
//   {kind:'impossible'}                    → 全通 boss 仍不足
//   {kind:'frontier', points, entries, need, total, below}
//        points = frontier 分數值；entries = 該分數的所有 boss 難度；
//        need = 此分數需完成幾隻；total = 此分數共有幾隻；
//        below = 所有分數更低、須另外實際完成的 boss 小計。
export function solveBossForNeeded(bosses, needed, level = Infinity) {
  if (needed <= 0) return { kind: 'none' }
  // 僅納入該 level 可入場的 boss
  const entries = flattenBossEntries(bosses).filter((e) => reachable(e.entryLevel, level))
  // 依分數分組（升序）
  const byPoints = new Map()
  for (const e of entries) {
    if (!byPoints.has(e.points)) byPoints.set(e.points, [])
    byPoints.get(e.points).push(e)
  }
  const points = [...byPoints.keys()].sort((a, b) => a - b)
  let cumBelow = 0
  for (const p of points) {
    const group = byPoints.get(p)
    const total = group.length
    const maxHere = cumBelow + total * p
    if (maxHere >= needed) {
      const need = Math.min(total, Math.ceil((needed - cumBelow) / p))
      return { kind: 'frontier', points: p, entries: group, need, total, below: cumBelow }
    }
    cumBelow = maxHere
  }
  return { kind: 'impossible' }
}

// ---- 方向 1：目標段位 → 各等級所需 boss ----

// 段位的 Kai 門檻 boss 難度分數（無門檻回傳 null）。
function gateEntry(bosses, tier) {
  const req = tier.boss_clear_require
  if (!req) return null
  const b = bosses.find((x) => x.id === req.boss)
  const d = b?.difficulties.find((x) => x.tier === req.difficulty)
  if (!d) return null
  return {
    bossId: req.boss,
    bossName: b.name_zh ?? b.name,
    tier: req.difficulty,
    points: d.challengers_points,
    entryLevel: d.entry_level ?? null,
  }
}

// 針對某段位、某等級，算出 boss 需求。
// 回傳 {level, status, ...}：
//   status 'level-only'  → 僅靠等級即達分數（gate 為 Kai 門檻 entry 或 null）
//   status 'impossible'  → 即使全通 boss 仍無法達成
//   status 'frontier'    → {points, entries, need, total, gate}（gate=true 表示此 frontier 即 Kai 門檻本身）
export function bossRequirement(cw, prefix, tier, level) {
  const lvPts = levelPoints(prefix, level)
  const needed = tier.challengers_points - lvPts
  const gate = gateEntry(cw.bosses, tier)

  // 門檻 boss 此等級無法入場 → 整個段位在此等級無法達成
  if (gate && !reachable(gate.entryLevel, level)) {
    return { level, status: 'impossible', gateUnreachable: gate }
  }

  const sol = solveBossForNeeded(cw.bosses, needed, level)

  // 無 Kai 門檻：直接回傳分數解
  if (!gate) {
    if (sol.kind === 'none') return { level, status: 'level-only', gate: null }
    if (sol.kind === 'impossible') return { level, status: 'impossible' }
    return { level, status: 'frontier', ...sol, gate: false }
  }

  // 有 Kai 門檻
  if (sol.kind === 'impossible') return { level, status: 'impossible' }
  // 分數解的 frontier 已 ≥ 門檻 → 門檻被向下涵蓋，沿用分數解
  if (sol.kind === 'frontier' && sol.points >= gate.points) {
    return { level, status: 'frontier', ...sol, gate: false }
  }
  // 分數解不足以涵蓋門檻（含 level-only）→ 必須打到 Kai；完成 Kai 即向下涵蓋所有更低分
  if (sol.kind === 'none') {
    return { level, status: 'level-only', gate }
  }
  return {
    level,
    status: 'frontier',
    points: gate.points,
    entries: [{ bossId: gate.bossId, bossName: gate.bossName, tier: gate.tier, points: gate.points }],
    need: 1,
    total: 1,
    below: sumBelow(cw.bosses, gate.points, level),
    gate: true,
  }
}

// 方向 1 主入口：給定段位，回傳 levels（260,265,...,290）的需求列。
export function tierToRequirements(cw, prefix, tierId, stepLevels) {
  const tier = cw.tiers.find((t) => t.tier === tierId)
  if (!tier) return []
  return stepLevels.map((lv) => bossRequirement(cw, prefix, tier, lv))
}

// 需求的「標題簽章」：用於區間壓縮，只看會呈現於標題的硬性條件，
// 刻意忽略 below（低分小計會隨等級可入場與否變動，但標題不變即視為同一列）。
function reqSignature(req) {
  if (req.status === 'level-only') {
    return `level-only|${req.gate ? `${req.gate.bossId}:${req.gate.tier}` : ''}`
  }
  if (req.status === 'impossible') {
    const g = req.gateUnreachable
    return `impossible|${g ? `${g.bossId}:${g.tier}` : 'pool'}`
  }
  const ids = req.entries.map((e) => `${e.bossId}:${e.tier}`).join(',')
  return `frontier|${req.points}|${req.need}|${req.total}|${req.gate}|${ids}`
}

// 方向 1 區間版：掃描每一級，把標題相同的連續等級壓成一段。
// 回傳 [{ fromLevel, toLevel, req }]（req 取該段起始等級的結果）。
export function tierToRequirementRanges(cw, prefix, tierId, levels) {
  const tier = cw.tiers.find((t) => t.tier === tierId)
  if (!tier) return []
  const ranges = []
  for (const lv of levels) {
    const req = bossRequirement(cw, prefix, tier, lv)
    const sig = reqSignature(req)
    const last = ranges[ranges.length - 1]
    if (last && last.sig === sig) last.toLevel = lv
    else ranges.push({ sig, fromLevel: lv, toLevel: lv, req })
  }
  return ranges
}

// ---- 方向 2：目標等級 + 目標 boss → 預定段位 ----

// 給定等級與 frontier（boss 難度或 null），算出總分、各段位達成狀態、最終段位。
export function planToTier(cw, prefix, level, frontier) {
  const lvPts = levelPoints(prefix, level)
  const { points: bossPts, cleared, self, frontierReachable } = frontierClosure(
    cw.bosses,
    frontier,
    level,
  )
  const total = lvPts + bossPts

  // 由高到低找最高達成段位
  const tiersDesc = [...cw.tiers].sort((a, b) => b.challengers_points - a.challengers_points)
  let achieved = null
  let blockedByGate = null
  for (const t of tiersDesc) {
    if (total < t.challengers_points) continue
    const req = t.boss_clear_require
    if (req && !cleared.has(entryKey(req.boss, req.difficulty))) {
      // 分數達標但 Kai 門檻未過 → 記錄一次（最高的那個），繼續往下找
      if (!blockedByGate) blockedByGate = { tier: t, req }
      continue
    }
    achieved = t
    break
  }
  // frontier 本身在此等級無法入場（其分數已不計入），提供警示
  const frontierUnreachable = frontier && !frontierReachable ? self : null
  return {
    level,
    levelPoints: lvPts,
    bossPoints: bossPts,
    total,
    achieved,
    blockedByGate,
    frontierUnreachable,
  }
}
