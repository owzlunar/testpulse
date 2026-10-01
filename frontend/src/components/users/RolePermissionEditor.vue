<script setup lang="ts">
import { ref } from 'vue'
import { PERMISSION_GROUPS } from '@/services/role.service'
import type { PermissionKey } from '@/types'

// A role's permissions grouped by module (collapsible, "all" per module). Used by the role page and RoleDialog.
const model = defineModel<PermissionKey[]>({ required: true })
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })

// all modules open by default
const open = ref(PERMISSION_GROUPS.map((g) => g.module))

const has = (key: PermissionKey) => model.value.includes(key)
const keysOf = (g: (typeof PERMISSION_GROUPS)[number]) => g.items.map((i) => i.key)
const countOf = (g: (typeof PERMISSION_GROUPS)[number]) => keysOf(g).filter(has).length

function toggle(key: PermissionKey, on: boolean | null) {
  model.value = on ? [...new Set([...model.value, key])] : model.value.filter((k) => k !== key)
}

function toggleGroup(g: (typeof PERMISSION_GROUPS)[number], on: boolean | null) {
  const keys = keysOf(g)
  model.value = on ? [...new Set([...model.value, ...keys])] : model.value.filter((k) => !keys.includes(k))
}
</script>

<template>
  <v-expansion-panels v-model="open" multiple variant="accordion" class="perm-editor">
    <v-expansion-panel v-for="g in PERMISSION_GROUPS" :key="g.module" :value="g.module" elevation="0">
      <v-expansion-panel-title>
        <div class="d-flex align-center ga-3 flex-grow-1 mr-2">
          <v-icon :icon="g.icon" size="18" color="primary" />
          <span class="text-subtitle-2 flex-grow-1">{{ g.module }}</span>
          <span class="text-caption fox-num" :class="countOf(g) ? 'text-primary' : 'text-muted'">{{ countOf(g) }}/{{ g.items.length }}</span>
          <v-checkbox-btn
            v-if="g.items.length > 1"
            class="flex-grow-0"
            density="compact"
            :model-value="countOf(g) === g.items.length"
            :indeterminate="countOf(g) > 0 && countOf(g) < g.items.length"
            :disabled="disabled"
            :aria-label="`เลือกทุกสิทธิ์ใน ${g.module}`"
            @click.stop
            @update:model-value="toggleGroup(g, $event)"
          />
        </div>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <v-row dense>
          <v-col v-for="item in g.items" :key="item.key" cols="12" md="6">
            <v-checkbox :model-value="has(item.key)" :disabled="disabled" density="compact" hide-details @update:model-value="toggle(item.key, $event)">
              <template #label>
                <div class="py-1">
                  <div class="text-body-2">{{ item.label }}</div>
                  <div class="text-caption text-muted">{{ item.description }}</div>
                </div>
              </template>
            </v-checkbox>
          </v-col>
        </v-row>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<style scoped>
.perm-editor {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--fox-radius-control);
  overflow: hidden;
}
</style>
