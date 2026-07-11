import { createRouter, createWebHashHistory } from 'vue-router'
import InputView from './views/InputView.vue'
import AstraView from './views/AstraView.vue'
import DestinyView from './views/DestinyView.vue'
import CwS3View from './views/CwS3View.vue'
import StarforceTableView from './views/StarforceTableView.vue'
import StarforcePlanView from './views/StarforcePlanView.vue'

// 導覽結構（單一來源）：頂層有 path 者為直連分頁，有 items 者為下拉分類。
// badge 顯示為收角緞帶（如 EVENT）；分類任一子項有 badge 時，分類標題同步顯示。
export const nav = [
  { label: '輸入', path: '/', component: InputView },
  {
    label: '任務進度',
    items: [
      { label: '阿斯特拉副武器', path: '/astra', component: AstraView },
      { label: '命運武器', path: '/destiny', component: DestinyView },
    ],
  },
  {
    label: '星力',
    items: [
      { label: '機率成本表', path: '/starforce/table', component: StarforceTableView },
      { label: '強化策略計算', path: '/starforce/planner', component: StarforcePlanView },
    ],
  },
  {
    label: '活動',
    items: [
      { label: '挑戰者 S3', path: '/cw-s3', component: CwS3View, badge: 'EVENT' },
    ],
  },
]

const routes = nav
  .flatMap((entry) => (entry.items ? entry.items : [entry]))
  .map(({ path, component }) => ({ path, component }))

// hash mode：GitHub Pages 純靜態主機下重整/直開子路徑不會 404，且與 base './' 相容。
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [...routes, { path: '/:pathMatch(.*)*', redirect: '/' }],
})
