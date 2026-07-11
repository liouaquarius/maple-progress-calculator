<script setup>
import { useRoute, useRouter } from 'vue-router'
import { store } from './store.js'
import { nav } from './router.js'
import NavTab from './components/NavTab.vue'
import NavGroup from './components/NavGroup.vue'

const route = useRoute()
const router = useRouter()
</script>

<template>
  <header class="navbar">
    <span class="title">楓之谷 進度計算器</span>
    <nav>
      <template v-for="entry in nav" :key="entry.label">
        <NavTab
          v-if="entry.path"
          :label="entry.label"
          :active="route.path === entry.path"
          :badge="entry.badge ?? ''"
          @select="router.push(entry.path)"
        />
        <NavGroup v-else :label="entry.label" :items="entry.items" />
      </template>
    </nav>
  </header>

  <main>
    <p v-if="store.loading" class="status">資料載入中…</p>
    <p v-else-if="store.error" class="error">{{ store.error }}</p>
    <router-view v-else />
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
