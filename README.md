# 楓之谷 進度計算器

計算楓之谷「阿斯特拉副武器」「命運武器」任務進度、「挑戰者世界 S3」段位達成需求，以及「星力強化」機率成本與期望策略的靜態網頁工具。輸入角色等級、當前任務進度與每週可攻略的 Boss，即可估算每週產出、各階段／任務的達成日期、最小浪費的攻略順序、命運的「單人通關」門檻檢定，並雙向對照挑戰者世界的段位與所需等級／Boss；星力頁另提供全星階機率費用表與期望成本最小化的逐星策略建議。

以 Vue 3 + Vite + vue-router（hash mode）開發，部署於 GitHub Pages（純前端、無後端）。

## 功能

- **輸入頁**：當前等級、開始／目標日期（選填）、命運／阿斯特拉的當前進度、可攻略 Boss（難度／人數／命運能力）。
- **阿斯特拉 / 命運頁**：
  - 每週產出（決心 / 痕跡 / 碎片，均分以無條件捨去計算）。
  - 進度條（含各 mission 邊界刻度、到目標日的預估段、邊界到達日）。
  - 各階段／任務的達成日期表（Boss 攻略以每週四計算；碎片有每日獲取，故逐日模擬）。
  - 命運的「最小浪費攻略順序」建議，與「單人通關需求」卡關檢定。
- **挑戰者 S3 頁**：段位 ↔ 需求雙向對照。① 選目標段位 → 各等級（可切換「每 5 等明細／變化節點」兩種檢視）所需完成的 Boss；② 輸入目標等級＋計畫完成的最高 Boss → 推算可達段位。計分含等級累加、Boss 向下累計、Kai 段位門檻與入場等級限制。
- **星力頁**：
  - **機率成本表**：全星階 成功／維持／破壞 機率（可切換原始值／常駐 ×1.05 加成後）、各裝等每次強化費用、破壞後救回（restart／restore）對照。
  - **強化策略計算**：輸入裝等、起始／目標星、道具市價、消費階級（強化費折扣，僅套用 16★ 以下）、卷軸，以「期望總花費最小化」（value iteration）求解——每星自動在 正常強化／防止破壞 擇優、破壞後自動在 重新開始／復原 擇優，輸出期望花費分項與逐星建議表。
- **導覽**：navbar 以「大分類 → 下拉細項」組織（任務進度／星力／活動）；hash 路由使各頁可直接以網址分享。
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
    refs/      item / boss(身分主檔) / boss_reward(astra・命運獎勵) / difficulty / area(含 daily)
               cw_s3_boss(挑戰者 S3 得分) / cw_s3_level(等級得分) / star_force(星力機率・費用・救回)
    missions/  destiny(含 mission.requirement) / astra / cw_s3_tier(段位需求)
  icons/       boss / item / area
src/
  views/       InputView / AstraView / DestinyView / CwS3View
               StarforceTableView(星力資料表) / StarforcePlanView(星力策略計算)
  components/   ProgressBar / ScheduleTable / StatCard / BossSelector / NavTab / NavGroup(下拉分類)
               DifficultyPicker / DifficultyBadge / BossBadge / CwBossReq / InputSummary / Icon
  lib/         calc.js（均分、產出、能力 order）/ schedule.js（達成日、卡關 gate）
               cw.js（挑戰者 S3 計分與雙向對照）/ starforce.js（星力期望成本最小化求解）
  router.js    hash 路由 + 導覽選單結構（單一來源）
  store.js     全域共享狀態（reactive）+ localStorage 持久化
  data/load.js 載入 public/data 的 JSON，並依 id join boss 身分＋各系統獎勵
  utils/       icon / format / itemColors
```

## 資料維護

遊戲數值集中在 `public/data/`，皆以英文 `id` 互相參照：

- **boss.json**：Boss 身分主檔——`id` / `name` / `name_zh` / 每難度的 `entry_level`（入場等級）與 `party_size_max`。所有系統的 Boss 皆以此為唯一身分來源。
- **boss_reward.json**：阿斯特拉／命運的每週獎勵——`difficulties`（`tier` + `rewards` 整隊總量 + 全域 `order` 強度排名）；命運門檻 Boss 另含 `tier: "destiny"`。
- **cw_s3_boss.json** / **cw_s3_level.json**：挑戰者 S3 的 Boss 得分（每難度 `challengers_points`）與等級累加得分。
- **missions/cw_s3_tier.json**：各段位達標分數與 `boss_clear_require`（Kai 通關門檻）。
- **difficulty.json**：難度中文名與配色（`color` / `textColor`）。
- **area.json**：每日區域與 `daily` 碎片量。
- **missions/destiny.json**、**astra.json**：各任務的 `cost`（消耗量）；命運另含 `requirement.boss`（需單人通關的 Boss）。
- **star_force.json**：星力每星階的原始 `rates`（success / destroy / maintain，不含常駐 ×1.05，加成由前端計算）與各裝等 `cost`；`repair` 含 restart（12★ 重來）與 restore（各裝等 × 破壞星數的道具數＋楓幣）。`discount` 為消費階級折扣（`tiers`：id／中文名／折扣 `pct`；`max_star`：折扣僅套用該星數（含）以下的強化費）。`scrolls` 為卷軸「券種家族」目錄（`name_zh` 內含 `n` 佔位，`n ∈ [n_min, n_max]` 每個值都是一張實際卷軸；策略頁以「家族＋n＋價格」動態建列，視為無限量供應）：
  - 必成券：`{ "id", "name_zh", "kind": "guaranteed", "n_min", "n_max" }`（無視當前星數直上 n★）
  - 突破／追加券：`{ "id", "name_zh", "kind": "additive", "n_min", "n_max", "rate" }`（n★ 前可用，成功 `rate` 升 1 星、失敗維持）；舊版「追加」系列另帶 `max_item_level: 200`（僅限該裝等以下使用），與「突破」僅差此限制。

改數值只需編輯這些 JSON，前端 `load.js` 會自動以 `id` join 出 Boss 身分＋各系統獎勵供顯示與計算。
