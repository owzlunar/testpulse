import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Project, ProjectInput, ProjectStats } from '@/types'
import { todayISO } from '@/utils/date'
import { useAppStore } from './app.store'
import { useAuditStore } from './audit.store'
import { useAuthStore } from './auth.store'
import { useNotificationStore } from './notification.store'
import { useRequirementStore } from './requirement.store'
import { useTestCaseStore } from './test-case.store'
import { apiOn, projectApi as api, reportApi } from '@/api'
import { caseStatsOf } from '@/domain/project'
import { loadSelectedProjectId, saveSelectedProjectId } from '@/utils/preferences'
import { downloadMarkdownFile, generateProjectMarkdown } from '@/domain/export'

/** case counts of a list of cases (the rule is the server's: caseStatsOf in project.service) */
export const statsOf = caseStatsOf

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const selectedProjectId = ref('')

  const testCaseStore = useTestCaseStore()
  const audit = useAuditStore()
  const notify = useNotificationStore()

  async function load() {
    projects.value = await api.fetchProjects()
    const remembered = loadSelectedProjectId()
    selectedProjectId.value = projects.value.some((p) => p.id === remembered) ? remembered! : (projects.value[0]?.id ?? '')
  }

  const currentProject = computed(() => projects.value.find((p) => p.id === selectedProjectId.value) ?? projects.value[0] ?? null)

  /** test cases of the selected project (flat and as a parent/sub-case tree) */
  const currentCases = computed(() => (currentProject.value ? testCaseStore.casesOf(currentProject.value.id) : []))
  const currentTree = computed(() => (currentProject.value ? testCaseStore.treeOf(currentProject.value.id) : []))

  /** a loaded project is counted from its cases (stays current after edits); others use the server's counts */
  function statsFor(projectId: string): ProjectStats {
    if (testCaseStore.isLoaded(projectId)) return statsOf(testCaseStore.casesOf(projectId))
    return projects.value.find((p) => p.id === projectId)?.caseStats ?? statsOf([])
  }
  const currentStats = computed(() => statsOf(currentCases.value))
  /** the selected project's cases have arrived (pages show a skeleton until then) */
  const currentCasesLoaded = computed(() => testCaseStore.isLoaded(currentProject.value?.id))

  const overallStats = computed(() => {
    const all = projects.value.map((p) => statsFor(p.id))
    const total = all.reduce((n, s) => n + s.total, 0)
    const passed = all.reduce((n, s) => n + s.passed, 0)
    return {
      totalProjects: projects.value.length,
      totalTestCases: total,
      passRate: total ? (passed / total) * 100 : 0,
      /** overdue or due soon, across projects */
      attention: all.reduce((n, s) => n + s.attention, 0),
    }
  })

  function select(projectId: string) {
    selectedProjectId.value = projectId
    saveSelectedProjectId(projectId)
    testCaseStore.ensureProject(projectId).catch(useAppStore().showError)
  }

  /** create (no id) or update */
  async function save(input: ProjectInput): Promise<Project> {
    if (input.id) {
      const updated = await api.updateProject(input.id, input)
      projects.value = projects.value.map((p) => (p.id === updated.id ? updated : p))
      audit.record({
        action: 'UPDATE',
        targetType: 'PROJECT',
        targetId: updated.id,
        targetTitle: updated.name,
        details: `อัปเดตข้อมูลโปรเจกต์ ${updated.name}`,
      })
      return updated
    }

    const project = await api.createProject(input)
    projects.value.unshift(project)
    select(project.id)
    audit.record({
      action: 'CREATE',
      targetType: 'PROJECT',
      targetId: project.id,
      targetTitle: project.name,
      details: `สร้างโปรเจกต์ใหม่ [${project.key}] ${project.name}`,
    })
    notify.add({
      type: 'MODIFIED',
      title: 'สร้างโปรเจกต์ใหม่',
      message: `โปรเจกต์ "${project.name}" ถูกสร้างแล้ว`,
      projectId: project.id,
      severity: 'info',
    })
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

    audit.record({
      action: 'DELETE',
      targetType: 'PROJECT',
      targetId: id,
      targetTitle: target.name,
      details: `ลบโปรเจกต์ ${target.name} พร้อม Test Case ทั้งหมด`,
    })
    if (selectedProjectId.value === id) select(projects.value[0]?.id ?? '')
  }

  /** Download the project's test cases as Obsidian Markdown (loads them first if needed) */
  async function exportMarkdown(projectId = selectedProjectId.value) {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return
    await testCaseStore.ensureProject(projectId)
    const cases = testCaseStore.casesOf(projectId)
    const filename = `${project.key}_TestCases_${todayISO()}.md`
    // recorded by the server before the file is handed out
    if (apiOn.report) await reportApi.recordExport(project.id, 'markdown', filename)
    downloadMarkdownFile(filename, generateProjectMarkdown(project, cases, statsOf(cases), useRequirementStore().textFor))

    audit.record({
      action: 'EXPORT',
      targetType: 'PROJECT',
      targetId: project.id,
      targetTitle: project.name,
      details: `ส่งออก Test Case ของ ${project.name} เป็น Obsidian Markdown (.md)`,
    })
    notify.add({
      type: 'SYSTEM',
      title: 'ส่งออกเอกสารสำเร็จ',
      message: `ดาวน์โหลด ${filename} แล้ว`,
      projectId: project.id,
      severity: 'success',
      to: { userIds: [useAuthStore().currentUser.id] }, // a confirmation for the exporter only
    })
    return filename
  }

  return {
    replaceMany,
    projects,
    selectedProjectId,
    currentProject,
    currentCases,
    currentTree,
    currentStats,
    overallStats,
    currentCasesLoaded,
    load,
    select,
    statsFor,
    save,
    remove,
    exportMarkdown,
  }
})
