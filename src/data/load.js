// 從 public/data/ 載入所有 JSON。
// 用 import.meta.env.BASE_URL 前綴，確保 GitHub Pages 子路徑下也能正確抓檔。
const base = import.meta.env.BASE_URL

async function loadJson(path) {
  const res = await fetch(`${base}data/${path}`)
  if (!res.ok) throw new Error(`資料載入失敗: ${path} (HTTP ${res.status})`)
  return res.json()
}

const indexById = (list) => Object.fromEntries((list ?? []).map((o) => [o.id, o]))

// boss 身分（refs/boss.json）為唯一來源；各系統獎勵另檔，依 id join 回身分。
// roster.difficulties 帶每難度 entry_level / party_size_max；下游用單一值，於此派生
// （entry_level = 各難度最小、party_size_max = 各難度最大）。
function joinBossIdentity(rosterById, id, rest) {
  const r = rosterById[id] ?? {}
  const diffs = r.difficulties ?? []
  const levels = diffs.map((d) => d.entry_level).filter((v) => v != null)
  const parties = diffs.map((d) => d.party_size_max).filter((v) => v != null)
  return {
    id,
    name: r.name ?? id,
    name_zh: r.name_zh ?? null,
    entry_level: levels.length ? Math.min(...levels) : null,
    party_size_max: parties.length ? Math.max(...parties) : null,
    ...rest,
  }
}

// 回傳整包遊戲資料；refs 為對照表、rewards 為計算用資料。
export async function loadGameData() {
  const [
    items,
    roster,
    bossReward,
    difficulties,
    areas,
    destiny,
    astra,
    cwTiers,
    cwBosses,
    cwLevels,
    starforce,
  ] = await Promise.all([
    loadJson('refs/item.json'),
    loadJson('refs/boss.json'), // boss 身分主檔（id/name/name_zh/每難度 level・party）
    loadJson('refs/boss_reward.json'), // astra/destiny 週獎勵（difficulties: rewards + order，含 destiny）
    loadJson('refs/difficulty.json'),
    loadJson('refs/area.json'), // 已內含 daily（每日碎片）
    loadJson('missions/destiny.json'),
    loadJson('missions/astra.json'),
    loadJson('missions/cw_s3_tier.json'), // Challengers World S3：段位需求
    loadJson('refs/cw_s3_boss.json'), // Challengers World S3：boss 得分
    loadJson('refs/cw_s3_level.json'), // Challengers World S3：等級得分
    loadJson('refs/star_force.json'), // 星力：每星機率/費用、破壞救回設定
  ])

  const rosterById = indexById(roster)

  // astra/destiny boss 清單：以獎勵表為主，join 身分並派生單一 entry_level / party_size_max
  const bosses = bossReward.map((rw) =>
    joinBossIdentity(rosterById, rw.id, { difficulties: rw.difficulties }),
  )

  // CW S3 boss 清單：以得分表為主，join 身分（name / name_zh），
  // 並把每難度的 entry_level（入場等級）自主檔帶入，供「能否入場」計算。
  const cwBossList = cwBosses.map((c) => {
    const r = rosterById[c.id] ?? {}
    const tierLevel = Object.fromEntries((r.difficulties ?? []).map((d) => [d.tier, d.entry_level]))
    const difficulties = c.difficulties.map((d) => ({ ...d, entry_level: tierLevel[d.tier] ?? null }))
    return joinBossIdentity(rosterById, c.id, { difficulties })
  })

  return {
    items,
    bosses,
    difficulties,
    areas,
    destiny,
    astra,
    cw: { tiers: cwTiers, bosses: cwBossList, levels: cwLevels },
    starforce,
  }
}
