// 從 public/data/ 載入所有 JSON。
// 用 import.meta.env.BASE_URL 前綴，確保 GitHub Pages 子路徑下也能正確抓檔。
const base = import.meta.env.BASE_URL

async function loadJson(path) {
  const res = await fetch(`${base}data/${path}`)
  if (!res.ok) throw new Error(`資料載入失敗: ${path} (HTTP ${res.status})`)
  return res.json()
}

// 回傳整包遊戲資料；refs 為對照表、rewards 為計算用資料。
export async function loadGameData() {
  const [items, bosses, difficulties, areas, destiny, astra] = await Promise.all([
    loadJson('refs/item.json'),
    loadJson('refs/boss.json'), // 已內含 difficulties（tier + rewards + order）
    loadJson('refs/difficulty.json'),
    loadJson('refs/area.json'), // 已內含 daily（每日碎片）
    loadJson('missions/destiny.json'),
    loadJson('missions/astra.json'),
  ])

  return { items, bosses, difficulties, areas, destiny, astra }
}
