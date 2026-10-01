<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MoveTarget } from '@/types'

// Reorder mode: move one case without dragging (top, bottom, before / after another case).
// A position is an insertion point: before item `index` of `list` (index === length = at the end).

const props = withDefaults(
  defineProps<{
    /** the case being moved: its list, index and the list's length */
    list: string
    index: number
    count: number
    targets: MoveTarget[]
    /** sub-case rows: icon-only buttons */
    compact?: boolean
  }>(),
  { compact: false },
)
const emit = defineEmits<{ move: [to: { list: string; index: number }] }>()

const menu = ref(false)
const search = ref('')

/** dropping right before or after itself changes nothing */
const isNoop = (list: string, index: number) => list === props.list && (index === props.index || index === props.index + 1)

const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return props.targets.filter((t) => !q || `${t.id} ${t.name}`.toLowerCase().includes(q))
})

function move(list: string, index: number) {
  menu.value = false
  emit('move', { list, index })
}
</script>

<template>
  <!-- nothing to show when the case is alone and there is nowhere else to put it -->
  <div v-if="count > 1 || targets.length" class="d-flex align-center ga-1 flex-shrink-0">
    <v-btn
      :icon="compact ? 'tabler:arrow-bar-to-up' : undefined"
      :prepend-icon="compact ? undefined : 'tabler:arrow-bar-to-up'"
      variant="tonal"
      color="primary"
      :size="compact ? 'x-small' : 'small'"
      :disabled="isNoop(list, 0)"
      title="ย้ายไปบนสุด"
      aria-label="ย้ายไปบนสุด"
      @click="move(list, 0)"
    >
      <template v-if="!compact">บนสุด</template>
    </v-btn>
    <v-btn
      :icon="compact ? 'tabler:arrow-bar-to-down' : undefined"
      :prepend-icon="compact ? undefined : 'tabler:arrow-bar-to-down'"
      variant="tonal"
      color="primary"
      :size="compact ? 'x-small' : 'small'"
      :disabled="isNoop(list, count)"
      title="ย้ายไปล่างสุด"
      aria-label="ย้ายไปล่างสุด"
      @click="move(list, count)"
    >
      <template v-if="!compact">ล่างสุด</template>
    </v-btn>
    <v-menu v-model="menu" location="bottom end" :close-on-content-click="false">
      <template #activator="{ props: activator }">
        <v-btn
          v-bind="activator"
          :icon="compact ? 'tabler:arrows-move-vertical' : undefined"
          :prepend-icon="compact ? undefined : 'tabler:arrows-move-vertical'"
          :append-icon="compact ? undefined : 'tabler:chevron-down'"
          variant="tonal"
          color="primary"
          :size="compact ? 'x-small' : 'small'"
          :disabled="!targets.length"
          title="ย้ายไปก่อน / หลังเคสอื่น"
          aria-label="ย้ายไปก่อน / หลังเคสอื่น"
        >
          <template v-if="!compact">ย้ายไป…</template>
        </v-btn>
      </template>
      <v-card min-width="320" max-width="420">
        <div class="pa-3 pb-1">
          <v-text-field
            v-model="search"
            density="compact"
            placeholder="ค้นหารหัสหรือชื่อ"
            prepend-inner-icon="tabler:search"
            hide-details
            autofocus
          />
        </div>
        <v-list density="compact" class="move-list">
          <template v-for="(t, i) in shown" :key="t.list + t.id">
            <v-list-subheader v-if="t.group && t.group !== shown[i - 1]?.group">{{ t.group }}</v-list-subheader>
            <v-list-item>
              <v-list-item-title class="text-body-2">
                <span class="fox-num text-primary mr-1">{{ t.id }}</span
                >{{ t.name }}
              </v-list-item-title>
              <template #append>
                <div class="d-flex ga-1 ml-2">
                  <v-btn size="x-small" variant="tonal" :disabled="isNoop(t.list, t.index)" @click="move(t.list, t.index)">ก่อน</v-btn>
                  <v-btn size="x-small" variant="tonal" :disabled="isNoop(t.list, t.index + 1)" @click="move(t.list, t.index + 1)">หลัง</v-btn>
                </div>
              </template>
            </v-list-item>
          </template>
          <v-list-item v-if="!shown.length" class="text-body-2 text-muted">ไม่พบเคส</v-list-item>
        </v-list>
      </v-card>
    </v-menu>
  </div>
</template>

<style scoped>
.move-list {
  max-height: 320px;
  overflow-y: auto;
}
</style>
