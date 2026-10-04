import { computed } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { storeToRefs } from 'pinia'
import { apiOn, defectApi, documentApi, requirementApi, runApi, testCaseApi } from '@/api'
import { defectStatusOf } from '@/domain/defect'
import { documentStatusOf } from '@/domain/document'
import { runStatusOf } from '@/domain/run'
import { statusOf } from '@/domain/test-case'
import { useAuthStore } from '@/stores/auth.store'
import { useProjectStore } from '@/stores/project.store'
import { useRequirementStore } from '@/stores/requirement.store'
import type { Project, TestCase, Tone } from '@/types'

// The universal search's groups (the header's dropdown and the results page): each one searches the
// server a page at a time (limit + offset) and turns what it finds into hits that look alike.

export type SearchKind = 'cases' | 'requirements' | 'defects' | 'runs' | 'documents' | 'projects'

export interface SearchHit {
  key: string
  /** the project's key before the code (case ids restart per project: PAY · TC-101, SHOP · TC-101) */
  projectKey?: string
  /** TC-101, REQ-PAY-04, BUG-001, รอบที่ 2, UAT-PAY-… */
  code: string
  title: string
  subtitle: string
  chip?: { text: string; tone: Tone }
  projectId: string
  to: RouteLocationRaw
}

export interface SearchPage {
  hits: SearchHit[]
  total: number
}

export interface SearchGroup {
  kind: SearchKind
  label: string
  icon: string
  fetch(q: string, limit: number, offset: number): Promise<SearchPage>
}

export function useUniversalSearch() {
  const router = useRouter()
  const auth = useAuthStore()
  const projectStore = useProjectStore()
  const { projects } = storeToRefs(projectStore)
  const requirementStore = useRequirementStore()
  const projectName = (id: string) => projects.value.find((p) => p.id === id)?.name ?? ''
  const projectKey = (id: string) => projects.value.find((p) => p.id === id)?.key

  const caseHit = (tc: TestCase): SearchHit => {
    const status = statusOf(tc.status)
    return {
      key: `case-${tc.uid}`,
      projectKey: projectKey(tc.projectId),
      code: tc.id,
      title: tc.name,
      subtitle: [projectName(tc.projectId), requirementStore.textFor(tc)].filter(Boolean).join(' · '),
      chip: { text: status.label, tone: status.tone as Tone },
      projectId: tc.projectId,
      to: { path: '/test-cases', query: { caseId: tc.id } },
    }
  }

  const projectHit = (p: Project): SearchHit => ({
    key: `project-${p.id}`,
    code: p.key,
    title: p.name,
    subtitle: p.description,
    projectId: p.id,
    to: '/test-cases',
  })

  const groups = computed<SearchGroup[]>(() => {
    const list: (SearchGroup & { on: boolean })[] = [
      {
        kind: 'cases',
        label: 'Test Cases',
        icon: 'tabler:flask',
        on: apiOn['test-case'] && auth.can('case.view'),
        fetch: async (q, limit, offset) => {
          const { cases, total } = await testCaseApi.searchTestCases(q, limit, offset)
          return { hits: cases.map(caseHit), total }
        },
      },
      {
        kind: 'requirements',
        label: 'Requirements',
        icon: 'tabler:list-check',
        on: apiOn.requirement && auth.can('requirement.view'),
        fetch: async (q, limit, offset) => {
          const { requirements, total } = await requirementApi.searchRequirements(q, limit, offset)
          const hits = requirements.map((r) => ({
            key: `req-${r.id}`,
            projectKey: projectKey(r.projectId),
            code: r.code,
            title: r.title,
            subtitle: projectName(r.projectId),
            projectId: r.projectId,
            to: { path: '/requirements', query: { search: r.code } },
          }))
          return { hits, total }
        },
      },
      {
        kind: 'defects',
        label: 'Defects',
        icon: 'tabler:bug',
        on: apiOn.defect && auth.can('defect.view'),
        fetch: async (q, limit, offset) => {
          const { defects, total } = await defectApi.searchDefects(q, limit, offset)
          const hits = defects.map((d) => {
            const status = defectStatusOf(d.status)
            return {
              key: `defect-${d.id}`,
              projectKey: projectKey(d.projectId),
              code: d.id,
              title: d.title,
              subtitle: [projectName(d.projectId), d.caseId].filter(Boolean).join(' · '),
              chip: { text: status.label, tone: status.tone as Tone },
              projectId: d.projectId,
              to: { path: '/defects', query: { id: d.id } },
            }
          })
          return { hits, total }
        },
      },
      {
        kind: 'runs',
        label: 'รอบการทดสอบ',
        icon: 'tabler:player-play',
        on: apiOn.run && auth.can('run.view'),
        fetch: async (q, limit, offset) => {
          const { runs, total } = await runApi.searchRuns(q, limit, offset)
          const hits = runs.map((r) => {
            const status = runStatusOf(r.status)
            return {
              key: `run-${r.id}`,
              projectKey: projectKey(r.projectId),
              code: `รอบที่ ${r.round}`,
              title: r.name,
              subtitle: [projectName(r.projectId), r.environment, r.build].filter(Boolean).join(' · '),
              chip: { text: status.label, tone: status.tone as Tone },
              projectId: r.projectId,
              to: `/test-runs/${r.id}`,
            }
          })
          return { hits, total }
        },
      },
      {
        kind: 'documents',
        label: 'เอกสาร',
        icon: 'tabler:file-certificate',
        on: apiOn.document && auth.can('document.view'),
        fetch: async (q, limit, offset) => {
          const { documents, total } = await documentApi.searchDocuments(q, limit, offset)
          const hits = documents.map((d) => {
            const status = documentStatusOf(d.status)
            return {
              key: `doc-${d.id}`,
              projectKey: projectKey(d.projectId),
              code: d.docNumber,
              title: d.title,
              subtitle: `${projectName(d.projectId)} · v${d.version}.0`,
              chip: { text: status.label, tone: status.tone as Tone },
              projectId: d.projectId,
              to: `/documents/${d.id}`,
            }
          })
          return { hits, total }
        },
      },
      {
        kind: 'projects',
        label: 'โปรเจกต์',
        icon: 'tabler:folders',
        on: true,
        // projects are loaded already: filtered here
        fetch: async (q, limit, offset) => {
          const text = q.trim().toLowerCase()
          const found = projects.value.filter((p) => `${p.name} ${p.key} ${p.description}`.toLowerCase().includes(text))
          return { hits: found.slice(offset, offset + limit).map(projectHit), total: found.length }
        },
      },
    ]
    return list.filter((g) => g.on)
  })

  /** selects the hit's project, then opens it */
  function open(hit: SearchHit) {
    projectStore.select(hit.projectId)
    return router.push(hit.to)
  }

  return { groups, caseHit, projectHit, open }
}
