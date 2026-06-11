// 顯示層格式工具：把語意數字（JSON 內維持阿拉伯數字）轉成羅馬數字呈現。
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
