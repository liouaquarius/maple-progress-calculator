// 由 type + id 推導 icon 路徑（約定優於設定，json 內不必存路徑）。
// 例：iconUrl('boss', 'kaling') -> '<base>icons/boss/kaling.png'
const base = import.meta.env.BASE_URL

export function iconUrl(type, id, ext = 'png') {
  return `${base}icons/${type}/${id}.${ext}`
}

// area 的 icon 命名不規則（英文名 slug + 混用副檔名），改由 area.json 的 icon 欄位指定檔名。
export function areaIconUrl(area) {
  return area?.icon ? `${base}icons/area/${area.icon}` : ''
}
