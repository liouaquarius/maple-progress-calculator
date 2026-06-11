import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base 用相對路徑 './'，讓本機 dev (/) 與 GitHub Pages 子路徑 (/repo/) 都能正確解析資源。
export default defineConfig({
  base: './',
  plugins: [vue()],
})
