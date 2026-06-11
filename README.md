# 楓之谷 阿斯特拉 / 命運 進度計算器

計算楓之谷「阿斯特拉副武器」與「命運武器」任務進度的靜態網頁工具。輸入角色等級、當前任務進度與每週可攻略的 Boss，即可估算每週產出、各階段／任務的達成日期、最小浪費的攻略順序，以及命運的「單人通關」門檻檢定。

以 Vue 3 + Vite 開發，部署於 GitHub Pages（純前端、無後端）。

## 功能

- **輸入頁**：當前等級、開始／目標日期（選填）、命運／阿斯特拉的當前進度、可攻略 Boss（難度／人數／命運能力）。
- **阿斯特拉 / 命運頁**：
  - 每週產出（決心 / 痕跡 / 碎片，均分以無條件捨去計算）。
  - 進度條（含各 mission 邊界刻度、到目標日的預估段、邊界到達日）。
  - 各階段／任務的達成日期表（Boss 攻略以每週四計算；碎片有每日獲取，故逐日模擬）。
  - 命運的「最小浪費攻略順序」建議，與「單人通關需求」卡關檢定。
- **持久化**：輸入內容存於 localStorage，重整後保留；可一鍵清除還原預設。

## 本機開發

需要 Node.js（建議 20+）。

```bash
npm install      # 安裝相依套件
npm run dev      # 啟動開發伺服器（http://localhost:5173/）
npm run build    # 產生正式版到 dist/
npm run preview  # 本機預覽正式版
```

## 部署（GitHub Pages）

已內建 GitHub Actions 工作流程（`.github/workflows/deploy.yml`）：推送到 `main` 後自動 `npm ci → npm run build → 部署 dist/`。

1. 推送專案到 GitHub（public repo）。
2. **Settings → Pages → Build and deployment → Source 選「GitHub Actions」**。
3. 網址為 `https://liouaquarius.github.io/maple-progress-calculator/`。

`vite.config.js` 的 `base` 設為相對路徑 `'./'`，本機與 Pages 子路徑皆可正確解析資源，不需依 repo 名稱調整。`dist/` 與 `node_modules/` 由 CI 產生／還原，不需也不應 commit。

## 專案結構

```
public/
  data/
    refs/      item / boss(含 difficulties:tier+rewards+order) / difficulty / area(含 daily)
    missions/  destiny(含 mission.requirement) / astra
  icons/       boss / item / area
src/
  views/       InputView / AstraView / DestinyView
  components/   ProgressBar / ScheduleTable / StatCard / BossSelector
               DifficultyPicker / DifficultyBadge / BossBadge / InputSummary / Icon
  lib/         calc.js（均分、產出、能力 order）/ schedule.js（達成日、卡關 gate）
  store.js     全域共享狀態（reactive）+ localStorage 持久化
  data/load.js 載入 public/data 的 JSON
  utils/       icon / format / itemColors
```

## 資料維護

遊戲數值集中在 `public/data/`，皆以英文 `id` 互相參照：

- **boss.json**：每隻 Boss 的 `difficulties`（`tier` + `rewards` 整隊總量 + 全域 `order` 強度排名）；命運門檻 Boss 另含 `tier: "destiny"` 標記其需求 `order`。
- **difficulty.json**：難度中文名與配色（`color` / `textColor`）。
- **area.json**：每日區域與 `daily` 碎片量。
- **missions/destiny.json**、**astra.json**：各任務的 `cost`（消耗量）；命運另含 `requirement.boss`（需單人通關的 Boss）。

改數值只需編輯這些 JSON，前端會自動以 `id` join 出顯示與計算。
