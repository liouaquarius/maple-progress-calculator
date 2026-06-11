<script setup>
import { roman } from '../utils/format.js'
import { fmt } from '../lib/schedule.js'
import BossBadge from './BossBadge.vue'

defineProps({
  rows: { type: Array, required: true },
  title: { type: String, default: '' }, // 有值時作為分組標題列
})

const STATUS_TEXT = { done: '已達成', ready: '可達成', unreachable: '期限內無法達成' }
function statusText(row) {
  return STATUS_TEXT[row.status] ?? ''
}
// pending / unreachable / blocked 才顯示週數與日期（blocked 僅同 stage 有 date）
function showsDate(row) {
  return row.status === 'pending' || row.status === 'unreachable' || row.status === 'blocked'
}
function weeksCell(row) {
  return showsDate(row) ? (row.weeks ?? '—') : '—'
}
function dateCell(row) {
  return showsDate(row) ? (row.date ? fmt(row.date) : '—') : '—'
}
// 灰字列：已達成、期限內未達成、卡關
function grey(row) {
  return row.status === 'done' || row.status === 'unreachable' || row.status === 'blocked'
}
</script>

<template>
  <table class="sched">
    <thead>
      <tr v-if="title"><th colspan="4" class="group">{{ title }}</th></tr>
      <tr><th></th><th>需週數</th><th>達成日期</th><th>任務狀態</th></tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.mission" :class="{ grey: grey(row) }">
        <td>任務 {{ roman(row.mission) }}</td>
        <td>{{ weeksCell(row) }}</td>
        <td>{{ dateCell(row) }}</td>
        <td>
          <template v-if="row.status === 'blocked' && row.reqBoss">
            攻略 <BossBadge :boss="row.reqBoss" difficulty="destiny" :size="16" class="req-badge" /> 後可達成
          </template>
          <template v-else>{{ statusText(row) }}</template>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.sched { border-collapse: collapse; }
.sched th, .sched td { border: 1px solid #3a3a44; padding: 0.2rem 0.8rem; text-align: left; height: 2.4rem; }
.sched tr.grey { opacity: 0.5; }
.sched th.group { text-align: center; background: #2a2a33; color: #cfe; }
.req-badge { margin: 0 0.2rem; vertical-align: middle; }
</style>
