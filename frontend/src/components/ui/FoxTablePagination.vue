<script setup lang="ts">
import { computed } from 'vue'

// Footer for v-data-table: put it in the table's #bottom slot
const page = defineModel<number>('page', { default: 1 })
const itemsPerPage = defineModel<number>('itemsPerPage', { default: 10 })
const props = withDefaults(defineProps<{ total: number; options?: number[] }>(), {
  options: () => [5, 10, 25, 50],
})

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / itemsPerPage.value)))
const from = computed(() => (props.total ? (page.value - 1) * itemsPerPage.value + 1 : 0))
const to = computed(() => Math.min(page.value * itemsPerPage.value, props.total))

function setPerPage(n: number) {
  itemsPerPage.value = n
  page.value = 1
}
</script>

<template>
  <div class="fox-pagination">
    <div class="d-flex align-center ga-3">
      <span class="text-body-2 text-muted text-no-wrap">แสดงต่อหน้า</span>
      <v-select
        class="fox-pagination__select"
        :model-value="itemsPerPage"
        :items="options"
        density="compact"
        hide-details
        @update:model-value="setPerPage"
      />
    </div>

    <div class="d-flex align-center ga-1">
      <span class="text-body-2 text-muted fox-num mr-2 text-no-wrap">{{ from }}–{{ to }} จาก {{ total }}</span>
      <v-btn icon="tabler:chevrons-left" variant="text" size="small" :disabled="page <= 1" aria-label="หน้าแรก" @click="page = 1" />
      <v-btn icon="tabler:chevron-left" variant="text" size="small" :disabled="page <= 1" aria-label="ก่อนหน้า" @click="page--" />
      <v-btn icon="tabler:chevron-right" variant="text" size="small" :disabled="page >= pageCount" aria-label="ถัดไป" @click="page++" />
      <v-btn icon="tabler:chevrons-right" variant="text" size="small" :disabled="page >= pageCount" aria-label="หน้าสุดท้าย" @click="page = pageCount" />
    </div>
  </div>
</template>

<style scoped>
.fox-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px 24px;
}

.fox-pagination__select {
  width: 88px;
  flex: none;
}

@media (max-width: 599.98px) {
  .fox-pagination {
    justify-content: center;
  }
}
</style>
