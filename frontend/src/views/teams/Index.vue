<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import UserAvatar from '@/components/users/UserAvatar.vue'
import TeamDialog from '@/components/users/TeamDialog.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { useAuthStore } from '@/stores/auth.store'
import { useProjectStore } from '@/stores/project.store'
import type { Team, TeamInput } from '@/types'

// Teams (Admin only): who is in which team, and which projects each team may open
const auth = useAuthStore()
const { teams, users } = storeToRefs(auth)
const projectStore = useProjectStore()
const { projects } = storeToRefs(projectStore)
const { snackbar, notify } = useSnackbar()
const { busy, run } = useAsyncAction()

const membersOf = (team: Team) => users.value.filter((u) => team.memberIds.includes(u.id))
const projectsOf = (team: Team) => projects.value.filter((p) => p.teamIds?.includes(team.id))
const openToAll = computed(() => projects.value.filter((p) => !p.teamIds?.length))

const dialog = ref(false)
const editing = ref<Team | null>(null)

function openTeam(team: Team | null) {
  editing.value = team
  dialog.value = true
}

function onSave(input: TeamInput) {
  run(
    () => auth.saveTeam(input),
    (saved) => {
      dialog.value = false
      notify(`${input.id ? 'บันทึก' : 'สร้าง'}${saved.name} แล้ว`)
    },
  )
}

// delete: projects whose only team this is become open to everyone with a role
const deleting = ref<Team | null>(null)
const deleteOpen = computed({ get: () => !!deleting.value, set: (v) => !v && (deleting.value = null) })
const opensUp = computed(() => (deleting.value ? projectsOf(deleting.value).filter((p) => p.teamIds?.length === 1) : []))

function onDelete() {
  const team = deleting.value
  if (!team) return
  run(
    () => auth.deleteTeam(team.id),
    (changed) => {
      projectStore.replaceMany(changed)
      deleting.value = null
      notify(`ลบ${team.name} แล้ว`)
    },
  )
}
</script>

<template>
  <FoxPageHeader sticky :breadcrumbs="[{ title: 'ผู้ดูแลระบบ' }, { title: 'ทีม' }]">
    <template #actions>
      <v-btn color="primary" prepend-icon="tabler:plus" @click="openTeam(null)">สร้างทีม</v-btn>
    </template>
  </FoxPageHeader>

  <div class="fox-stack">
    <v-alert type="info" variant="tonal" density="compact" icon="tabler:info-circle">
      โปรเจกต์ที่เลือกทีมไว้ เปิดได้เฉพาะสมาชิกของทีมนั้น (ต้องมี Role ด้วย) โปรเจกต์ที่ไม่ระบุทีม ทุกคนที่มี Role เปิดได้ และ Admin
      เปิดได้ทุกโปรเจกต์ เลือกทีมของโปรเจกต์ได้ที่ "แก้ไขโปรเจกต์" ในหน้าภาพรวม
    </v-alert>

    <v-row class="fox-grid">
      <v-col v-for="t in teams" :key="t.id" cols="12" md="6" xl="4">
        <v-card class="fox-card-body h-100 d-flex flex-column">
          <div class="d-flex align-start ga-3 mb-2">
            <v-avatar :color="t.tone" size="44"><v-icon icon="tabler:users-group" /></v-avatar>
            <div class="flex-grow-1 overflow-hidden">
              <div class="text-h6 text-truncate">{{ t.name }}</div>
              <div class="text-body-2 text-muted text-truncate">{{ t.description || '-' }}</div>
            </div>
          </div>

          <div class="text-overline text-muted mt-2">สมาชิก {{ membersOf(t).length }} คน</div>
          <div v-if="membersOf(t).length" class="d-flex flex-wrap ga-2">
            <v-chip v-for="u in membersOf(t)" :key="u.id" size="small" variant="tonal">
              <template #prepend><UserAvatar :user="u" size="18" class="mr-1" /></template>
              {{ u.name }}
            </v-chip>
          </div>
          <p v-else class="text-body-2 text-muted">ยังไม่มีสมาชิก</p>

          <div class="text-overline text-muted mt-3">โปรเจกต์ที่เข้าถึงได้</div>
          <div v-if="projectsOf(t).length" class="d-flex flex-wrap ga-2">
            <v-chip v-for="p in projectsOf(t)" :key="p.id" size="small" color="primary" variant="outlined" prepend-icon="tabler:folder">{{
              p.name
            }}</v-chip>
          </div>
          <p v-else class="text-body-2 text-muted">ยังไม่มีโปรเจกต์ที่เลือกทีมนี้</p>

          <v-spacer />
          <div class="d-flex align-center ga-1 mt-4">
            <v-btn variant="tonal" color="primary" size="small" prepend-icon="tabler:pencil" @click="openTeam(t)">แก้ไข</v-btn>
            <v-spacer />
            <v-btn icon="tabler:trash" variant="text" size="small" color="error" :aria-label="`ลบ${t.name}`" @click="deleting = t" />
          </div>
        </v-card>
      </v-col>
      <v-col v-if="!teams.length" cols="12">
        <v-card
          ><FoxEmptyState icon="tabler:users-group" title="ยังไม่มีทีม" text="สร้างทีมแล้วเลือกทีมให้โปรเจกต์ เพื่อจำกัดว่าใครเปิดโปรเจกต์ได้"
        /></v-card>
      </v-col>
    </v-row>

    <v-card class="fox-card-body">
      <h2 class="text-h6 mb-1">โปรเจกต์ที่ไม่ระบุทีม</h2>
      <p class="text-body-2 text-muted mb-3">ทุกคนที่มี Role เปิดได้</p>
      <div v-if="openToAll.length" class="d-flex flex-wrap ga-2">
        <v-chip v-for="p in openToAll" :key="p.id" size="small" variant="outlined" prepend-icon="tabler:world">{{ p.name }}</v-chip>
      </div>
      <p v-else class="text-body-2 text-muted">ทุกโปรเจกต์ระบุทีมแล้ว</p>
    </v-card>
  </div>

  <TeamDialog v-model="dialog" :team="editing" :loading="busy" @save="onSave" />

  <v-dialog v-model="deleteOpen" max-width="460">
    <v-card v-if="deleting" class="fox-card-body">
      <h2 class="text-h5 mb-2">ลบ{{ deleting.name }}?</h2>
      <p class="text-body-2 text-muted">สมาชิกจะไม่ถูกลบ แต่จะเข้าโปรเจกต์ของทีมนี้ไม่ได้อีก (ถ้าไม่ได้อยู่ทีมอื่นของโปรเจกต์นั้น)</p>
      <v-alert v-if="opensUp.length" type="warning" variant="tonal" density="compact" class="mt-3">
        {{ opensUp.map((p) => p.name).join(', ') }} จะไม่เหลือทีม และทุกคนที่มี Role จะเปิดได้
      </v-alert>
      <div class="d-flex justify-end ga-3 mt-4">
        <v-btn variant="outlined" @click="deleting = null">ยกเลิก</v-btn>
        <v-btn color="error" prepend-icon="tabler:trash" :loading="busy" @click="onDelete">ลบทีม</v-btn>
      </div>
    </v-card>
  </v-dialog>
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>
