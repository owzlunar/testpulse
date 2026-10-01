import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Project, ProjectInput, ProjectStats, TestCase, TestCaseStatus } from '@/types'
import * as api from '@/services/project.service'
import { STATUSES } from '@/services/test-case.service'
import { downloadMarkdownFile, generateProjectMarkdown } from '@/services/export.service'
import { todayISO } from '@/utils/date'
import { useAuditStore } from './audit.store'
import { useNotificationStore } from './notification.store'
import { useRequirementStore } from './requirement.store'
import { useTestCaseStore } from './test-case.store'

export function statsOf(cases: TestCase[]): ProjectStats {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s.value, 0])) as Record<TestCaseStatus, number>
  cases.forEach((tc) => byStatus[tc.status]++)
  const total = cases.length
  return {
    total,
    passed: byStatus.passed,
    failed: byStatus.failed,
    blocked: byStatus.blocked,
    inProgress: byStatus.in_progress,
    untested: byStatus.untested,
    passRate: total ? (byStatus.passed / total) * 100 : 0,
    byStatus,
  }
}

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const selectedProjectId = ref('')

  const testCaseStore = useTestCaseStore()
  const audit = useAuditStore()
  const notify = useNotificationStore()

  async function load() {
    projects.value = await api.fetchProjects()
    const remembered = api.loadSelectedProjectId()
    selectedProjectId.value = projects.value.some((p) => p.id === remembered) ? remembered! : projects.value[0]?.id ?? ''
  }

  const currentProject = computed(
    () => projects.value.find((p) => p.id === selectedProjectId.value) ?? projects.value[0] ?? null,
  )

  /** test cases of the selected project (flat and as a parent/sub-case tree) */
  const currentCases = computed(() => (currentProject.value ? testCaseStore.casesOf(currentProject.value.id) : []))
  const currentTree = computed(() => (currentProject.value ? testCaseStore.treeOf(currentProject.value.id) : []))

  const statsFor = (projectId: string) => statsOf(testCaseStore.casesOf(projectId))
  const currentStats = computed(() => statsOf(currentCases.value))

  const overallStats = computed(() => {
    const all = testCaseStore.activeCases
    const passed = all.filter((tc) => tc.status === 'passed').length
    return {
      totalProjects: projects.value.length,
      totalTestCases: all.length,
      passRate: all.length ? (passed / all.length) * 100 : 0,
    }
  })

  function select(projectId: string) {
    selectedProjectId.value = projectId
    api.saveSelectedProjectId(projectId)
  }

  /** create (no id) or update */
  async function save(input: ProjectInput): Promise<Project> {
    if (input.id) {
      const updated = await api.updateProject(input.id, input)
      projects.value = projects.value.map((p) => (p.id === updated.id ? updated : p))
      audit.record({ action: 'UPDATE', targetType: 'PROJECT', targetId: updated.id, targetTitle: updated.name, details: `อัปเดตข้อมูลโปรเจกต์ ${updated.name}` })
      return updated
    }

    const project = await api.createProject(input)
    projects.value.unshift(project)
    select(project.id)
    audit.record({ action: 'CREATE', targetType: 'PROJECT', targetId: project.id, targetTitle: project.name, details: `สร้างโปรเจกต์ใหม่ [${project.key}] ${project.name}` })
    notify.add({ type: 'MODIFIED', title: 'สร้างโปรเจกต์ใหม่', message: `โปรเจกต์ "${project.name}" ถูกสร้างแล้ว`, projectId: project.id, severity: 'info' })
    return project
  }

  /** deletes the project and all of its test cases */
  /** show server copies of projects that changed elsewhere (e.g. a deleted team was removed from them) */
  function replaceMany(changed: Project[]) {
    changed.forEach((p) => {
      const i = projects.value.findIndex((x) => x.id === p.id)
      if (i >= 0) projects.value[i] = p
    })
  }

  async function remove(id: string) {
    const target = projects.value.find((p) => p.id === id)
    if (!target) return
    await api.deleteProject(id)
    projects.value = projects.value.filter((p) => p.id !== id)
    testCaseStore.removeProjectCases(id)

    audit.record({ action: 'DELETE', targetType: 'PROJECT', targetId: id, targetTitle: target.name, details: `ลบโปรเจกต์ ${target.name} พร้อม Test Case ทั้งหมด` })
    if (selectedProjectId.value === id) select(projects.value[0]?.id ?? '')
  }

  /** Download the project's test cases as Obsidian Markdown */
  function exportMarkdown(projectId = selectedProjectId.value) {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return
    const cases = testCaseStore.casesOf(projectId)
    const filename = `${project.key}_TestCases_${todayISO()}.md`
    downloadMarkdownFile(filename, generateProjectMarkdown(project, cases, statsOf(cases), useRequirementStore().textFor))

    audit.record({ action: 'EXPORT', targetType: 'PROJECT', targetId: project.id, targetTitle: project.name, details: `ส่งออก Test Case ของ ${project.name} เป็น Obsidian Markdown (.md)` })
    notify.add({ type: 'SYSTEM', title: 'ส่งออกเอกสารสำเร็จ', message: `ดาวน์โหลด ${filename} แล้ว`, projectId: project.id, severity: 'success' })
    return filename
  }

  return {
    replaceMany,
    projects, selectedProjectId, currentProject, currentCases, currentTree, currentStats, overallStats,
    load, select, statsFor, save, remove, exportMarkdown,
  }
})
