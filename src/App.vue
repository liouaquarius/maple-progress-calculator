<script setup>
import { ref } from 'vue'
import { store } from './store.js'
import InputView from './views/InputView.vue'
import AstraView from './views/AstraView.vue'
import DestinyView from './views/DestinyView.vue'
import CwS3View from './views/CwS3View.vue'
import NavTab from './components/NavTab.vue'

const tabs = [
  { id: 'input', label: '輸入', comp: InputView },
  { id: 'astra', label: '阿斯特拉副武器', comp: AstraView },
  { id: 'destiny', label: '命運武器', comp: DestinyView },
  { id: 'cws3', label: '挑戰者 S3', comp: CwS3View, badge: 'EVENT' },
]
const active = ref('input')
</script>

<template>
  <header class="navbar">
    <span class="title">阿斯特拉 / 命運 任務進度計算器</span>
    <nav>
      <NavTab
        v-for="t in tabs"
        :key="t.id"
        :label="t.label"
        :active="active === t.id"
        :badge="t.badge"
        @select="active = t.id"
      />
    </nav>
  </header>

  <main>
    <p v-if="store.loading" class="status">資料載入中…</p>
    <p v-else-if="store.error" class="error">{{ store.error }}</p>
    <component v-else :is="tabs.find((t) => t.id === active).comp" />
  </main>
</template>

<style scoped>
.navbar {
  display: flex; align-items: center; gap: 1.5rem;
  padding: 0.6rem 1rem; margin-bottom: 1.2rem;
  background: #20202a; border: 1px solid #33333c; border-radius: 8px;
}
.title { font-weight: bold; }
nav { display: flex; gap: 0.4rem; }
</style>
