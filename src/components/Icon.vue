<script setup>
// 通用 icon：載入失敗（檔案未補）時自動隱藏，不破壞版面。
defineProps({
  src: { type: String, default: '' },
  size: { type: Number, default: 20 },
})
function hide(e) {
  e.target.style.display = 'none'
}
</script>

<template>
  <img v-if="src" :src="src" alt="" class="ic" :style="{ width: size + 'px', height: size + 'px' }" @error="hide" />
</template>

<style scoped>
.ic { object-fit: contain; vertical-align: middle; }
</style>
