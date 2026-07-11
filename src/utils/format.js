// 顯示層格式工具：羅馬數字、千分位、大額楓幣（萬/億/兆）、百分比。

// 千分位整數（四捨五入）
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US')

// 大額楓幣縮寫：取 萬/億/兆 層級，保留至多 4 位有效數字（如 29,216,259,880 → 292.2億）
export function fmtMeso(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  for (const [v, u] of [[1e12, '兆'], [1e8, '億'], [1e4, '萬']]) {
    if (abs >= v) return `${parseFloat((n / v).toPrecision(4)).toLocaleString('en-US')}${u}`
  }
  return fmtInt(n)
}

// 機率 → 百分比字串，至多 2 位小數（尾零去除，如 0.679 → 67.9%）
export const fmtPct = (x) => `${parseFloat((x * 100).toFixed(2))}%`

// 把語意數字（JSON 內維持阿拉伯數字）轉成羅馬數字呈現。
const ROMAN = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

// 進度條上各 mission 邊界（累計成本 / 總量）。
// 回傳 [{ pct, date, final }]；date 取自 dates[i]（該資源到達該邊界的日期，null 表示已達成或永不可達）；
// final 標記最後一個（pct=100，僅標日期不畫刻度線）。實際是否顯示由 ProgressBar 依進度/目標日判斷。
export function boundaryMarks(items, costKey, total, dates = []) {
  if (!total) return []
  let cum = 0
  const marks = []
  for (let i = 0; i < items.length; i++) {
    cum += items[i].cost?.[costKey] ?? 0
    marks.push({ pct: (cum / total) * 100, date: dates[i] ?? null, final: i === items.length - 1 })
  }
  return marks
}

export function roman(n) {
  if (!Number.isInteger(n) || n <= 0) return String(n)
  let s = ''
  let v = n
  for (const [val, sym] of ROMAN) {
    while (v >= val) {
      s += sym
      v -= val
    }
  }
  return s
}
