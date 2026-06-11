// 各 item icon 的平均色調（忽略透明像素計算），作為進度條主色。
// 由 public/icons/item/*.png 解碼平均得出。
export const ITEM_COLOR = {
  resolve: '#5b6aa5', // 敵對者的決心：藍紫
  battle_traces: '#a65f2c', // 猛烈的戰鬥痕跡：橙棕
  erion_fragment: '#9e9389', // 俄里翁的碎片：灰褐
}

// 把 hex 往白色混合，產生較亮的右端漸層色。
function lighten(hex, amt = 0.35) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const mix = (c) => Math.round(c + (255 - c) * amt)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

// 進度條填色：主色 → 亮色的水平漸層。
export function barFill(id) {
  const base = ITEM_COLOR[id] ?? '#4a90d9'
  return `linear-gradient(90deg, ${base}, ${lighten(base)})`
}
