import { reactive, computed, watch } from 'vue'
import { loadGameData } from './data/load.js'
import {
  resolveInStage,
  totalResolveAccumulated,
  stageTotal,
  astraTotals,
  astraAccumulated,
} from './lib/calc.js'

const byId = (list) => Object.fromEntries((list ?? []).map((o) => [o.id, o]))

const pad = (n) => String(n).padStart(2, '0')
const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

const STORAGE_KEY = 'maple-input-v1'

// 全域共享狀態：input 頁輸入的資料，astra / destiny 頁讀取。
export const store = reactive({
  loading: true,
  error: null,
  data: null,

  // input
  level: 260,
  daysPerWeek: 7,
  startDate: todayStr(), // 開始日期 YYYY-MM-DD（計入累計，當天為週四則含 boss）
  useTargetDate: false, // 是否啟用目標日期
  targetDate: todayStr(), // 目標日期 YYYY-MM-DD（含當天；啟用時僅計 [開始, 目標] 期間獲得量）
  bossSel: {}, // bossId -> { enabled, difficulty, partySize }
  destiny: { stageIndex: 0, missionIndex: 0, currentResolve: null }, // currentResolve = 當前 mission 已投入（空 = 0）
  astra: { missionIndex: 0, currentTraces: null, currentErion: null }, // 當前 astra mission 已投入（空 = 0）
  // 星力策略頁輸入：itemValue = 道具市價（空 = 不計道具成本）、discountPct = 強化費折扣 %（空 = 無）
  starforce: { level: 160, startStar: 12, targetStar: 22, itemValue: null, safeguard: true, discountPct: null },
})

// 依資料建立 boss 選擇預設（最低真實難度、1 人、未勾選）。difficulty 存的是 tier id。
function defaultBossSel(d) {
  const sel = {}
  for (const boss of d.bosses) {
    const first = boss.difficulties.find((x) => x.tier !== 'destiny') ?? boss.difficulties[0]
    sel[boss.id] = { enabled: false, difficulty: first?.tier, partySize: 1, destiny: false }
  }
  return sel
}

// 把 input 還原為預設值
function applyDefaults() {
  store.level = 260
  store.startDate = todayStr()
  store.useTargetDate = false
  store.targetDate = todayStr()
  Object.assign(store.destiny, { stageIndex: 0, missionIndex: 0, currentResolve: null })
  Object.assign(store.astra, { missionIndex: 0, currentTraces: null, currentErion: null })
  Object.assign(store.starforce, { level: 160, startStar: 12, targetStar: 22, itemValue: null, safeguard: true, discountPct: null })
  store.bossSel = store.data ? defaultBossSel(store.data) : {}
}

// 持久化（localStorage）：僅存 input 相關欄位
function persist() {
  try {
    const { level, startDate, useTargetDate, targetDate, bossSel, destiny, astra, starforce } = store
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, startDate, useTargetDate, targetDate, bossSel, destiny, astra, starforce }))
  } catch {
    /* 無 localStorage 時略過 */
  }
}

// 從 localStorage 還原（boss 以現有 id 為準合併，忽略過時/缺漏）
function hydrate() {
  let saved
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    saved = null
  }
  if (!saved) return
  if (saved.level != null) store.level = saved.level
  if (saved.startDate) store.startDate = saved.startDate
  store.useTargetDate = !!saved.useTargetDate
  if (saved.targetDate) store.targetDate = saved.targetDate
  if (saved.destiny) Object.assign(store.destiny, saved.destiny)
  if (saved.astra) Object.assign(store.astra, saved.astra)
  if (saved.starforce) Object.assign(store.starforce, saved.starforce)
  if (saved.bossSel) {
    for (const [id, v] of Object.entries(saved.bossSel)) {
      if (store.bossSel[id]) Object.assign(store.bossSel[id], v)
    }
  }
}

// 清除 input：還原預設並清掉持久化資料
export function resetInput() {
  applyDefaults()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 略過 */
  }
}

loadGameData()
  .then((d) => {
    store.data = d
    store.bossSel = defaultBossSel(d)
    hydrate() // 先還原儲存值（在 InputView 掛載前，不會被其重設 watcher 影響）
    // 之後任何 input 變更都即時持久化
    watch(
      () => [store.level, store.startDate, store.useTargetDate, store.targetDate, store.bossSel, store.destiny, store.astra, store.starforce],
      persist,
      { deep: true },
    )
  })
  .catch((e) => { store.error = e.message })
  .finally(() => { store.loading = false })

// 查表
export const itemMap = computed(() => byId(store.data?.items))
export const bossMap = computed(() => byId(store.data?.bosses))
export const difficultyMap = computed(() => byId(store.data?.difficulties))
export const areaMap = computed(() => byId(store.data?.areas))

// 出現在任何 destiny mission requirement 的 boss（= 需要「命運」能力旗標者），由 destiny.json 推導
export const destinyBosses = computed(() => {
  const set = new Set()
  for (const stage of store.data?.destiny ?? []) {
    for (const m of stage.missions) {
      if (m.requirement?.boss) set.add(m.requirement.boss)
    }
  }
  return set
})

// 玩家「單人(1人)所選難度的最高 order」= 能力指標。
// 直接複用 enabledBosses（已含 enabled && 未鎖定），再篩 1 人即可；不計入 destiny tier。
export const maxSoloOrder = computed(() => {
  let max = 0
  for (const sel of enabledBosses.value) {
    if (sel.partySize !== 1) continue
    const boss = store.data.bosses.find((b) => b.id === sel.boss)
    const d = boss?.difficulties.find((x) => x.tier === sel.difficulty)
    if (d && d.tier !== 'destiny' && typeof d.order === 'number') max = Math.max(max, d.order)
  }
  return max
})

// 手動標記「可達成」的 boss，其 destiny tier order 取最大。
export const maxDestinyOrder = computed(() => {
  if (!store.data) return 0
  let max = 0
  for (const boss of store.data.bosses) {
    if ((boss.entry_level ?? 0) > store.level) continue
    const s = store.bossSel[boss.id]
    if (!s || !s.destiny) continue
    const d = boss.difficulties.find((x) => x.tier === 'destiny')
    if (d && typeof d.order === 'number') max = Math.max(max, d.order)
  }
  return max
})

// 通關能力天花板：單人能力與手動標記取大。mission 需求 order ≤ 此值 → 不卡關。
export const destinyCeiling = computed(() => Math.max(maxSoloOrder.value, maxDestinyOrder.value))

// 某 boss 是否因等級不足而鎖定
export const isBossLocked = (bossId) => (bossMap.value[bossId]?.entry_level ?? 0) > store.level

// 已勾選且等級達標（可攻略）的 boss
export const enabledBosses = computed(() => {
  if (!store.data) return []
  return Object.entries(store.bossSel)
    .filter(([id, s]) => s.enabled && !isBossLocked(id))
    .map(([boss, s]) => ({ boss, difficulty: s.difficulty, partySize: s.partySize }))
})

// 衍生進度
export const destinyDerived = computed(() => {
  if (!store.data) return null
  const { stageIndex, missionIndex, currentResolve } = store.destiny
  const stage = store.data.destiny[stageIndex]
  const inStage = resolveInStage(stage, missionIndex, currentResolve)
  const sTotal = stageTotal(stage)
  return {
    stage,
    inStage,
    sTotal,
    remainingInStage: Math.max(0, sTotal - inStage),
    totalAccum: totalResolveAccumulated(store.data.destiny, stageIndex, missionIndex, currentResolve),
  }
})

export const astraDerived = computed(() => {
  if (!store.data) return null
  const totals = astraTotals(store.data.astra)
  const accumulated = astraAccumulated(
    store.data.astra,
    store.astra.missionIndex,
    store.astra.currentTraces,
    store.astra.currentErion,
  )
  return {
    totals,
    accumulated,
    remaining: {
      traces: Math.max(0, totals.traces - accumulated.traces),
      erion: Math.max(0, totals.erion - accumulated.erion),
    },
  }
})
