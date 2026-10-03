import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProjectReport } from '@/types'
import { reportApi as api } from '@/api'

// A project's report, computed by the server from its cases, runs and defects (fetched fresh for each visit)
export const useReportStore = defineStore('report', () => {
  const report = ref<ProjectReport | null>(null)

  async function load(projectId: string) {
    const next = await api.fetchProjectReport(projectId)
    report.value = next
    return next
  }

  return { report, load }
})
