// 日期排程：boss 週期為「週四 00:00 ~ 週三 23:59」，預設每週四攻略。
// Destiny 的 resolve 僅來自 boss（每週四），故達成日必為週四。
// Astra 的碎片另有每日獲取，故以「逐日模擬」推算達成日（不一定落在週四）。
//
// 每列回傳 status：
//   'done'    已達成（位置早於當前 mission，已提交）
//   'ready'   可完成（當前或之後，且目前累積已達標、尚未提交）
//   'pending' 尚未達標 → 附 weeks（約略週數）與 date（達成日）

const DAY = 86400000

// 把 'YYYY-MM-DD' 以本地時間解析，避免 UTC 時區位移。
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fmt(date) {
  if (!date) return '—'
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

// 下一個可攻略的週四（今天就是週四則為今天，否則往後最近的週四）。getDay: 0=日…4=四。
export function nextThursday(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const add = (4 - d.getDay() + 7) % 7
  return new Date(d.getTime() + add * DAY)
}

function addWeeks(date, weeks) {
  return new Date(date.getTime() + weeks * 7 * DAY)
}

function weeksBetween(from, to) {
  return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (7 * DAY)))
}

// [start, end] 含兩端期間內的可攻略週四數（boss 次數）。
export function thursdaysInRange(start, end) {
  const first = nextThursday(start)
  if (first.getTime() > end.getTime()) return 0
  return Math.floor((end.getTime() - first.getTime()) / (7 * DAY)) + 1
}

// [start, end] 含兩端的天數。
export function daysInRange(start, end) {
  if (end.getTime() < start.getTime()) return 0
  return Math.floor((end.getTime() - start.getTime()) / DAY) + 1
}

// 刻度標註用日期 Y/M/D。
export function fmtMD(date) {
  return date ? `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}` : ''
}

// Destiny（mission 粒度）：resolve 僅每週四累加。
// currentTotal = 目前已累積的總 resolve（跨 stage）；curStageIndex/curMissionIndex = 當前所在位置。
// endDate = 目標日期（含當天）；null 表示不限期。
// 每列：status（done/ready/pending/unreachable）+ 開放式 weeks/date（unreachable 仍保留，僅 done/ready 為 null）。
// gate（選填）：{ ceiling, orderByBoss } — 通關能力天花板與各 boss 的 destiny 需求 order。
// 若某 mission 的 requirement boss 之 order > ceiling → 該 mission 起（含其後）狀態 'blocked'，
// 且只顯示「同 stage 的 resolve 達標日」（後續 stage 無日期）。
export function destinyMissionSchedule(destiny, currentTotal, weekly, fromDate, curStageIndex, curMissionIndex, endDate = null, gate = null) {
  const first = nextThursday(fromDate)
  let cumulative = 0
  let blocked = false
  let blockStageIdx = -1
  const rows = []
  for (let si = 0; si < destiny.length; si++) {
    const stage = destiny[si]
    for (let mi = 0; mi < stage.missions.length; mi++) {
      const m = stage.missions[mi]
      cumulative += m.cost.resolve ?? 0
      const base = { stage: stage.stage, mission: m.mission }

      // 通關需求判定：第一個未滿足者起進入 blocked（含其後）
      if (gate && m.requirement?.boss && !blocked) {
        const ro = gate.orderByBoss[m.requirement.boss]
        if (ro != null && ro > gate.ceiling) {
          blocked = true
          blockStageIdx = si
        }
      }

      if (blocked) {
        let weeks = null
        let date = null
        if (si === blockStageIdx) {
          const need = cumulative - currentTotal // 只算同 stage 的 resolve 達標日
          if (need > 0 && weekly > 0) {
            weeks = Math.ceil(need / weekly)
            date = addWeeks(first, weeks - 1)
          }
        }
        // 「期限內無法達成」優先於「卡關」：達標日超過目標日 → status 改為 unreachable
        const unreachable = endDate && date && date.getTime() > endDate.getTime()
        rows.push({
          ...base,
          status: unreachable ? 'unreachable' : 'blocked',
          blocked: true, // 仍標記卡關，供注意事項警示
          reqBoss: m.requirement?.boss ?? null,
          weeks,
          date,
          lastOfStage: mi === stage.missions.length - 1, // 是否為該 stage 最後一個 mission（硬上限邊界）
        })
        continue
      }

      const before = si < curStageIndex || (si === curStageIndex && mi < curMissionIndex)
      const need = cumulative - currentTotal
      if (before) {
        rows.push({ ...base, status: 'done', weeks: null, date: null })
      } else if (need <= 0) {
        rows.push({ ...base, status: 'ready', weeks: null, date: null })
      } else if (!weekly || weekly <= 0) {
        rows.push({ ...base, status: 'pending', weeks: null, date: null })
      } else {
        const weeks = Math.ceil(need / weekly)
        const date = addWeeks(first, weeks - 1)
        const status = endDate && date.getTime() > endDate.getTime() ? 'unreachable' : 'pending'
        rows.push({ ...base, status, weeks, date })
      }
    }
  }
  return rows
}

// Astra（mission 粒度）：痕跡每週四累加；碎片每日累加 + 週四 boss 量。逐日模擬達成日。
//   accumulated = { traces, erion } 目前累積
//   weeklyTraces / weeklyErionBoss = boss 每週量；dailyErionPerDay = 每日碎片量
//   curMissionIndex = 當前所在 mission
// Astra（mission 粒度）：痕跡每週四累加；碎片每日 + 週四 boss。
// 痕跡、碎片各自獨立逐日模擬出到達日（tracesDate / erionDate）；
// 任務完成日 date = max(tracesDate, erionDate)。
// 每列：status + 開放式 weeks/date（unreachable 仍保留）+ tracesDate/erionDate（供兩條進度條各自標註）。
export function astraSchedule(astra, accumulated, weeklyTraces, weeklyErionBoss, dailyErionPerDay, fromDate, curMissionIndex, endDate = null) {
  const start = new Date(fromDate)
  start.setHours(0, 0, 0, 0)
  const firstThu = nextThursday(start)
  const n = astra.length

  // 累計門檻
  let cT = 0
  let cE = 0
  const cumT = []
  const cumE = []
  for (const s of astra) {
    cT += s.cost.battle_traces ?? 0
    cE += s.cost.erion_fragment ?? 0
    cumT.push(cT)
    cumE.push(cE)
  }

  // 逐日模擬，分別記錄痕跡、碎片各門檻到達日（已達成 → null；永不可達 → null）
  const tracesArr = new Array(n).fill(null)
  const erionArr = new Array(n).fill(null)
  let tr = accumulated.traces
  let er = accumulated.erion
  let ti = 0
  let ei = 0
  while (ti < n && tr >= cumT[ti]) ti++ // 已達成不需到達日
  while (ei < n && er >= cumE[ei]) ei++
  const perWeekT = weeklyTraces || 0
  const perWeekE = (dailyErionPerDay || 0) * 7 + (weeklyErionBoss || 0)
  // 安全上限（線性累積必在有限天達標、達標即 break，故正常不會跑滿）；
  // 放大以涵蓋每日獲取量極小（如每天 1）時需數千~上萬天的情況。
  const MAX_DAYS = 365 * 120
  for (let d = 0; d <= MAX_DAYS; d++) {
    if ((ti >= n || perWeekT <= 0) && (ei >= n || perWeekE <= 0)) break
    const cur = new Date(start.getTime() + d * DAY)
    const isThu = cur.getDay() === 4 && cur.getTime() >= firstThu.getTime()
    if (isThu) tr += weeklyTraces || 0
    er += dailyErionPerDay || 0
    if (isThu) er += weeklyErionBoss || 0
    while (ti < n && tr >= cumT[ti]) tracesArr[ti++] = cur
    while (ei < n && er >= cumE[ei]) erionArr[ei++] = cur
  }

  return astra.map((s, i) => {
    const base = { mission: s.mission, tracesDate: tracesArr[i], erionDate: erionArr[i] }
    const met = accumulated.traces >= cumT[i] && accumulated.erion >= cumE[i]
    if (i < curMissionIndex) return { ...base, status: 'done', weeks: null, date: null }
    if (met) return { ...base, status: 'ready', weeks: null, date: null }
    // 兩者皆需到達；任一永不可達則 date null
    const reachedTraces = accumulated.traces >= cumT[i] ? start : tracesArr[i]
    const reachedErion = accumulated.erion >= cumE[i] ? start : erionArr[i]
    if (!reachedTraces || !reachedErion) return { ...base, status: 'pending', weeks: null, date: null }
    const date = reachedTraces.getTime() >= reachedErion.getTime() ? reachedTraces : reachedErion
    const status = endDate && date.getTime() > endDate.getTime() ? 'unreachable' : 'pending'
    return { ...base, status, weeks: weeksBetween(start, date), date }
  })
}
