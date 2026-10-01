<script setup lang="ts">
import { computed } from 'vue'
import { coverageOf } from '@/services/requirement.service'
import { defectStatusOf, severityOf } from '@/services/defect.service'
import { UAT_DECISIONS, documentStatusOf, documentTypeOf } from '@/services/document.service'
import { priorityOf } from '@/services/test-case.service'
import { resultOf, runTypeOf } from '@/services/run.service'
import type { DocumentRecord, DocumentTemplate } from '@/types'
import { formatDateTH, formatDateTime } from '@/utils/date'
import { formatPercent } from '@/utils/format'

// A4 rendering of a generated document. The same markup is used for print/PDF and the Word download.
const props = defineProps<{ doc: DocumentRecord; template: DocumentTemplate }>()

const s = computed(() => props.doc.snapshot)
const type = computed(() => documentTypeOf(props.doc.type))
const isUat = computed(() => props.doc.type === 'uat')
const showSteps = computed(() => props.doc.options.includeSteps && props.doc.type !== 'rtm')
const failedCases = computed(() => s.value.cases.filter((c) => c.outcome === 'failed' || c.outcome === 'blocked'))
const detailCases = computed(() => (props.doc.type === 'test_summary' || isUat.value ? failedCases.value : s.value.cases))

/** section numbers follow the sections actually rendered */
const sections = computed(() => {
  const t = props.doc.type
  const list: string[] = ['info']
  if (t !== 'rtm') list.push('summary')
  if (t !== 'rtm' && t !== 'test_spec') list.push('results')
  if (s.value.defects.length) list.push('defects')
  if (s.value.requirements.length) list.push('rtm')
  if (showSteps.value && detailCases.value.length) list.push('details')
  if (isUat.value) list.push('decision')
  if (props.doc.signatories.length) list.push('signoff')
  return list
})
const no = (key: string) => sections.value.indexOf(key) + 1
</script>

<template>
  <!-- always light: Vuetify scopes the light theme variables to this class -->
  <div class="v-theme--light doc-wrap">
    <article class="doc-sheet">
      <!-- header -->
      <header class="doc-header">
        <div class="d-flex align-center ga-3">
          <img v-if="template.logo" :src="template.logo" alt="" class="doc-logo" />
          <div>
            <div class="doc-company">{{ template.companyName }}</div>
            <div class="doc-small doc-muted">{{ template.companyAddress }}</div>
          </div>
        </div>
        <table class="doc-meta">
          <tbody>
            <tr><th>เลขที่เอกสาร</th><td>{{ doc.docNumber }}</td></tr>
            <tr><th>เวอร์ชัน</th><td>{{ doc.version }}.0</td></tr>
            <tr><th>วันที่</th><td>{{ formatDateTH(s.generatedAt, { day: 'numeric', month: 'long', year: 'numeric' }) }}</td></tr>
            <tr><th>สถานะ</th><td>{{ documentStatusOf(doc.status).label }}</td></tr>
          </tbody>
        </table>
      </header>

      <div class="doc-title">
        <div class="doc-type">{{ type.label }}</div>
        <h1>{{ doc.title }}</h1>
        <div class="doc-muted">{{ s.project.name }} ({{ s.project.key }})</div>
      </div>

      <p v-if="template.headerNote" class="doc-small doc-muted doc-center">{{ template.headerNote }}</p>

      <!-- 1. info -->
      <section>
        <h2>{{ no('info') }}. ข้อมูลทั่วไป</h2>
        <table class="doc-table doc-kv">
          <tbody>
            <tr><th>โปรเจกต์</th><td>{{ s.project.name }}</td></tr>
            <tr v-if="s.project.description"><th>ขอบเขต</th><td>{{ s.project.description }}</td></tr>
            <tr v-if="s.run"><th>รอบการทดสอบ</th><td>{{ s.run.name }} · รอบที่ {{ s.run.round }} ({{ runTypeOf(s.run.type).label }})</td></tr>
            <tr v-if="isUat && doc.uat"><th>ช่วงเวลาตรวจรับ</th><td>{{ doc.uat.testPeriod }}</td></tr>
            <tr v-else-if="s.run"><th>ช่วงเวลาทดสอบ</th><td>{{ formatDateTH(s.run.plannedStart) }} – {{ formatDateTH(s.run.plannedEnd) }}</td></tr>
            <tr v-if="isUat && doc.uat"><th>สภาพแวดล้อม</th><td>{{ doc.uat.environment }}</td></tr>
            <tr v-else-if="s.run"><th>สภาพแวดล้อม</th><td>{{ s.run.environment }}<template v-if="s.run.build"> · Build {{ s.run.build }}</template></td></tr>
            <tr v-if="s.project.targetDeadline"><th>กำหนดส่งมอบ</th><td>{{ formatDateTH(s.project.targetDeadline) }}</td></tr>
            <tr><th>จัดทำโดย</th><td>{{ doc.createdBy }} · {{ formatDateTime(s.generatedAt) }}</td></tr>
          </tbody>
        </table>
      </section>

      <!-- 2. summary -->
      <section v-if="sections.includes('summary')">
        <h2>{{ no('summary') }}. สรุปผล</h2>
        <table class="doc-table doc-summary">
          <thead><tr><th>ทั้งหมด</th><th>ผ่าน</th><th>ไม่ผ่าน</th><th>Blocked</th><th>ยังไม่ทดสอบ</th><th>Pass rate</th></tr></thead>
          <tbody>
            <tr>
              <td>{{ s.summary.total }}</td><td>{{ s.summary.passed }}</td><td>{{ s.summary.failed }}</td>
              <td>{{ s.summary.blocked }}</td><td>{{ s.summary.notRun }}</td><td><strong>{{ formatPercent(s.summary.passRate) }}</strong></td>
            </tr>
          </tbody>
        </table>
        <div v-if="s.risks.length && doc.type !== 'test_spec'" class="doc-callout">
          <strong>ประเด็นความเสี่ยง ณ วันที่จัดทำเอกสาร</strong>
          <ul><li v-for="r in s.risks" :key="r">{{ r }}</li></ul>
        </div>
      </section>

      <!-- test spec: cases list -->
      <section v-if="doc.type === 'test_spec'">
        <table class="doc-table">
          <thead><tr><th>รหัส</th><th>ชื่อ Test Case</th><th>Requirement</th><th>Priority</th><th>ขั้นตอน</th></tr></thead>
          <tbody>
            <tr v-for="c in s.cases" :key="c.id">
              <td class="doc-nowrap">{{ c.id }}</td><td>{{ c.name }}</td><td class="doc-pre">{{ c.requirement }}</td><td>{{ priorityOf(c.priority).label }}</td><td class="doc-center">{{ c.steps.length }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 3. results per case -->
      <section v-if="sections.includes('results')">
        <h2>{{ no('results') }}. ผลการทดสอบรายเคส</h2>
        <table class="doc-table">
          <thead><tr><th>รหัส</th><th>ชื่อ Test Case</th><th>Priority</th><th>ผล</th><th>ผู้ทดสอบ / วันที่</th></tr></thead>
          <tbody>
            <tr v-for="c in s.cases" :key="c.id">
              <td class="doc-nowrap">{{ c.id }}</td>
              <td>{{ c.name }}<div v-if="c.actualResults" class="doc-small doc-muted">{{ c.actualResults }}</div></td>
              <td>{{ priorityOf(c.priority).label }}</td>
              <td class="doc-nowrap"><span class="doc-badge" :class="`doc-badge--${c.outcome}`">{{ c.result }}</span></td>
              <td class="doc-small">{{ c.executedBy || '-' }}<div v-if="c.executedAt" class="doc-muted">{{ formatDateTime(c.executedAt) }}</div></td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- defects -->
      <section v-if="sections.includes('defects')">
        <h2>{{ no('defects') }}. Defect ที่พบ</h2>
        <table class="doc-table">
          <thead><tr><th>รหัส</th><th>หัวข้อ</th><th>Severity</th><th>สถานะ</th><th>Test Case</th><th>ผู้รับผิดชอบ</th></tr></thead>
          <tbody>
            <tr v-for="d in s.defects" :key="d.id">
              <td class="doc-nowrap">{{ d.id }}<div v-if="d.externalKey" class="doc-small doc-muted">{{ d.externalKey }}</div></td>
              <td>{{ d.title }}</td><td>{{ severityOf(d.severity).label }}</td><td>{{ defectStatusOf(d.status).label }}</td>
              <td>{{ d.caseId || '-' }}</td><td class="doc-small">{{ d.assignee || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- traceability -->
      <section v-if="sections.includes('rtm')">
        <h2>{{ no('rtm') }}. Requirement Traceability Matrix</h2>
        <table class="doc-table">
          <thead><tr><th>Requirement</th><th>ชื่อ</th><th>Test Cases</th><th>Coverage</th></tr></thead>
          <tbody>
            <tr v-for="r in s.requirements" :key="r.code">
              <td class="doc-nowrap">{{ r.code }}</td><td>{{ r.title }}</td><td>{{ r.caseIds.join(', ') || '—' }}</td><td>{{ coverageOf(r.coverage).label }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- case details -->
      <section v-if="sections.includes('details')">
        <h2>{{ no('details') }}. {{ doc.type === 'test_spec' ? 'รายละเอียด Test Case' : 'รายละเอียดเคสที่ไม่ผ่าน' }}</h2>
        <div v-for="c in detailCases" :key="c.id" class="doc-case">
          <h3>{{ c.id }} · {{ c.name }}</h3>
          <table class="doc-table doc-kv">
            <tbody>
              <tr><th>Requirement</th><td class="doc-pre">{{ c.requirement || '-' }}</td></tr>
              <tr><th>Scenario</th><td>{{ c.testScenario }}</td></tr>
              <tr v-if="c.prerequisite"><th>Prerequisite</th><td class="doc-pre">{{ c.prerequisite }}</td></tr>
            </tbody>
          </table>
          <table class="doc-table doc-steps">
            <thead>
              <tr><th>#</th><th>ขั้นตอน</th><th>Test Data</th><th>ผลที่คาดหวัง</th><th v-if="c.stepResults">ผล</th></tr>
            </thead>
            <tbody>
              <tr v-for="(st, i) in c.steps" :key="st.id">
                <td class="doc-center">{{ i + 1 }}</td><td class="doc-pre">{{ st.action }}</td><td class="doc-pre">{{ st.testData }}</td><td class="doc-pre">{{ st.expectedResult }}</td>
                <td v-if="c.stepResults" class="doc-nowrap">
                  <span class="doc-badge" :class="`doc-badge--${c.stepResults[i]?.status === 'untested' ? 'not_run' : c.stepResults[i]?.status}`">{{ resultOf(c.stepResults[i]?.status ?? 'untested').label }}</span>
                  <div v-if="c.stepResults[i]?.actual" class="doc-small">{{ c.stepResults[i].actual }}</div>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="doc-small"><strong>ผลลัพธ์ที่คาดหวัง:</strong> {{ c.expectedResults }}</p>
          <p v-if="c.actualResults && doc.type !== 'test_spec'" class="doc-small"><strong>ผลจริง:</strong> {{ c.actualResults }}</p>
          <div v-if="c.evidence.length" class="doc-evidence">
            <figure v-for="(img, i) in c.evidence" :key="i">
              <img :src="img" :alt="`หลักฐาน ${c.id} รูปที่ ${i + 1}`" />
              <figcaption>รูปที่ {{ i + 1 }}</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <!-- UAT decision -->
      <section v-if="isUat && doc.uat">
        <h2>{{ no('decision') }}. มติการตรวจรับ</h2>
        <ul class="doc-decision">
          <li v-for="d in UAT_DECISIONS" :key="d.value">
            <span class="doc-box">{{ doc.uat.decision === d.value ? '✓' : '' }}</span> {{ d.full }}
          </li>
        </ul>
        <p v-if="doc.uat.remarks"><strong>ข้อคิดเห็นและข้อตกลง:</strong> {{ doc.uat.remarks }}</p>
        <p v-if="doc.uat.riskAcknowledged" class="doc-small doc-muted">ผู้จัดทำรับทราบความเสี่ยงของ Release นี้ ณ เวลาที่สร้างเอกสาร</p>
      </section>

      <!-- sign-off -->
      <section v-if="doc.signatories.length" class="doc-keep">
        <h2>{{ no('signoff') }}. การลงนาม</h2>
        <div class="doc-signs">
          <div v-for="(sg, i) in doc.signatories" :key="i" class="doc-sign">
            <div class="doc-sign__line">
              <span v-if="sg.status === 'signed'" class="doc-signed">ลงนามแล้ว (อิเล็กทรอนิกส์)</span>
              <span v-else-if="sg.status === 'rejected'" class="doc-rejected">ไม่อนุมัติ</span>
            </div>
            <div>( {{ sg.name || '................................................' }} )</div>
            <div class="doc-small">{{ sg.position }}</div>
            <div class="doc-small doc-muted">{{ sg.role }}</div>
            <div class="doc-small doc-muted">วันที่ {{ sg.signedAt ? formatDateTH(sg.signedAt) : '......../......../........' }}</div>
            <div v-if="sg.comment" class="doc-small">หมายเหตุ: {{ sg.comment }}</div>
          </div>
        </div>
      </section>

      <footer class="doc-footer doc-small doc-muted">
        <span>{{ template.footerNote }}</span>
        <span>{{ doc.docNumber }} · v{{ doc.version }}.0 · สร้างโดย TestPulse</span>
      </footer>
    </article>
  </div>
</template>

<style scoped>
/* A document is always "paper": theme tokens of the light theme (scoped by the wrapper class) */
.doc-wrap {
  background: transparent;
}

.doc-sheet {
  max-width: 210mm;
  margin: 0 auto;
  padding: 18mm 16mm;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--fox-shadow-card);
  font-size: 13px;
  line-height: 1.6;
}

.doc-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid rgb(var(--v-theme-primary));
}

.doc-logo {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.doc-company {
  font-weight: 600;
  font-size: 15px;
}

.doc-meta {
  font-size: 12px;
  border-collapse: collapse;
}

.doc-meta th {
  padding: 0 8px 0 0;
  text-align: right;
  font-weight: 500;
  color: rgb(var(--v-theme-muted));
}

.doc-title {
  margin: 28px 0 8px;
  text-align: center;
}

.doc-type {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}

.doc-title h1 {
  margin: 4px 0;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.4;
}

section {
  margin-top: 22px;
}

h2 {
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}

h3 {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}

.doc-table {
  width: 100%;
  margin-bottom: 8px;
  border-collapse: collapse;
}

.doc-table th,
.doc-table td {
  padding: 6px 8px;
  border: 1px solid rgba(var(--v-border-color), 0.2);
  vertical-align: top;
  text-align: left;
}

.doc-table thead th {
  background: rgba(var(--v-theme-primary), 0.08);
  font-weight: 600;
}

.doc-kv th {
  width: 150px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  font-weight: 500;
}

.doc-summary td,
.doc-summary th {
  text-align: center;
}

.doc-steps th:first-child {
  width: 32px;
}

.doc-case {
  margin-bottom: 18px;
  break-inside: avoid;
}

.doc-callout {
  margin-top: 8px;
  padding: 10px 14px;
  border-left: 4px solid rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.1);
}

.doc-callout ul {
  margin: 4px 0 0 18px;
}

.doc-badge {
  display: inline-block;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.doc-badge--passed {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.12);
}

.doc-badge--failed {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.12);
}

.doc-badge--blocked,
.doc-badge--skipped {
  color: rgb(var(--v-theme-caution));
  background: rgba(var(--v-theme-caution), 0.14);
}

.doc-badge--not_run {
  color: rgb(var(--v-theme-muted));
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.doc-evidence {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.doc-evidence figure {
  margin: 0;
}

.doc-evidence img {
  width: 100%;
  border: 1px solid rgba(var(--v-border-color), 0.2);
}

.doc-evidence figcaption {
  font-size: 11px;
  color: rgb(var(--v-theme-muted));
  text-align: center;
}

.doc-decision {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}

.doc-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  border: 1.5px solid rgb(var(--v-theme-on-surface));
  font-size: 12px;
  line-height: 1;
}

.doc-signs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 24px;
  margin-top: 16px;
  text-align: center;
}

.doc-sign__line {
  height: 40px;
  margin-bottom: 6px;
  border-bottom: 1px dotted rgb(var(--v-theme-on-surface));
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.doc-signed {
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--v-theme-success));
}

.doc-rejected {
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--v-theme-error));
}

.doc-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 32px;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--v-border-color), 0.2);
}

.doc-keep {
  break-inside: avoid;
}

.doc-small {
  font-size: 12px;
}

.doc-muted {
  color: rgb(var(--v-theme-muted));
}

.doc-center {
  text-align: center;
}

.doc-nowrap {
  white-space: nowrap;
}

.doc-pre {
  white-space: pre-line;
}

@media (max-width: 599.98px) {
  .doc-sheet {
    padding: 20px 16px;
    font-size: 12px;
  }

  .doc-header {
    flex-direction: column;
  }

  .doc-sheet {
    overflow-x: auto;
  }
}
</style>
