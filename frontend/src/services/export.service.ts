import type { Project, ProjectStats, TestCase } from '@/types'

// Obsidian-flavoured Markdown export (YAML frontmatter + callouts). Emoji here are part of the
// exported document, not the app UI.

/**
 * Generates Obsidian-compatible Markdown for a project's test suite
 */
export function generateProjectMarkdown(
  project: Project,
  testCases: TestCase[],
  stats: ProjectStats,
  /** linked requirement text of a case (see requirementText); defaults to the case's own text */
  requirementOf: (tc: TestCase) => string = (tc) => tc.requirement,
): string {
  const now = new Date().toISOString()
  const tags = ['qa', 'test-suite', 'testpulse', project.key.toLowerCase(), ...project.tags.map((t) => t.toLowerCase())]

  let md = `---
title: "${project.name} - Test Case Specification & Execution Report"
project_key: "${project.key}"
project_id: "${project.id}"
exported_at: "${now}"
total_cases: ${stats.total}
passed: ${stats.passed}
failed: ${stats.failed}
blocked: ${stats.blocked}
in_progress: ${stats.inProgress}
untested: ${stats.untested}
pass_rate: "${stats.passRate.toFixed(1)}%"
tags:
${tags.map((t) => `  - ${t}`).join('\n')}
---

# 📋 ${project.name} (\`${project.key}\`)
> **TestPulse Quality Assurance & Test Case Specification Document**
> *Generated on ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}*

---

> [!SUMMARY] 📊 Test Execution Summary
> - **Total Test Cases**: \`${stats.total}\`
> - **Passed**: \`${stats.passed}\` (${stats.total ? ((stats.passed / stats.total) * 100).toFixed(1) : 0}%) ✅
> - **Failed**: \`${stats.failed}\` ❌
> - **Blocked**: \`${stats.blocked}\` 🚫
> - **In Progress**: \`${stats.inProgress}\` ⏳
> - **Untested**: \`${stats.untested}\` ⚪
> - **Overall Pass Rate**: \`${stats.passRate.toFixed(1)}%\`
> - **Target Deadline**: \`${project.targetDeadline || 'N/A'}\`

---

## 📑 Table of Contents
| ID | Test Case Name | Priority | Status | Sub-cases |
| :--- | :--- | :---: | :---: | :---: |
`

  // Separate parents and sub-cases
  const parentCases = testCases.filter((tc) => !tc.parentId)
  const getSubcases = (parentId: string) => testCases.filter((tc) => tc.parentId === parentId)

  parentCases.forEach((tc) => {
    const subcases = getSubcases(tc.id)
    const statusIcon = getStatusIcon(tc.status)
    md += `| [${tc.id}](#${slugify(tc.id + ' ' + tc.name)}) | ${tc.name} | \`${tc.priority.toUpperCase()}\` | ${statusIcon} ${tc.status.toUpperCase()} | ${subcases.length} |\n`

    subcases.forEach((sub) => {
      const subStatusIcon = getStatusIcon(sub.status)
      md += `| ↳ [${sub.id}](#${slugify(sub.id + ' ' + sub.name)}) | *${sub.name}* | \`${sub.priority.toUpperCase()}\` | ${subStatusIcon} ${sub.status.toUpperCase()} | Sub-case |\n`
    })
  })

  md += `\n---\n\n## 🧪 Detailed Test Case Specifications\n\n`

  parentCases.forEach((tc) => {
    md += renderTestCaseMarkdown(tc, requirementOf)

    const subcases = getSubcases(tc.id)
    if (subcases.length > 0) {
      md += `\n### 🗂️ Sub-Test Cases for \`${tc.id}\`\n\n`
      subcases.forEach((sub) => {
        md += renderTestCaseMarkdown(sub, requirementOf, true)
      })
    }
  })

  md += `\n---\n*Exported automatically by **TestPulse Platform** for Obsidian PKM System*\n`
  return md
}

function renderTestCaseMarkdown(tc: TestCase, requirementOf: (tc: TestCase) => string, isSubcase = false): string {
  const heading = isSubcase ? `### ↳ 🔍 ${tc.id}: ${tc.name}` : `## 🧪 ${tc.id}: ${tc.name}`
  const statusIcon = getStatusIcon(tc.status)

  let out = `${heading}

> [!INFO] **Metadata**
> - **Test Case ID**: \`${tc.id}\` (Numeric ID: \`${tc.numericId}\`)
> - **Status**: ${statusIcon} **${tc.status.toUpperCase()}**
> - **Priority**: \`${tc.priority.toUpperCase()}\`
> - **Assigned Tester**: \`${tc.assignedTo || 'Unassigned'}\`
> - **Due / Expiry Date**: \`${tc.expiryDate || 'N/A'}\`
> - **Last Updated**: \`${tc.updatedAt}\`
${tc.parentId ? `> - **Parent Test Case**: [[${tc.parentId}]]` : ''}

> [!NOTE] 📌 Requirement
> ${requirementOf(tc).replace(/\n/g, '\n> ') || 'N/A'}

> [!TIP] 🎯 Test Scenario
> ${tc.testScenario || 'N/A'}

#### Description
${tc.description || 'No description provided.'}

#### Prerequisites
${
  tc.prerequisite
    ? tc.prerequisite
        .split('\n')
        .map((p) => `- ${p}`)
        .join('\n')
    : '*None specified*'
}

#### 📝 Test Execution Steps
| Step # | Action | Test Data | Expected Step Result |
| :---: | :--- | :--- | :--- |
`
  if (tc.steps && tc.steps.length > 0) {
    tc.steps.forEach((s) => {
      out += `| **${s.stepNumber}** | ${mdCell(s.action)} | ${mdCell(s.testData, true) || '`-`'} | ${mdCell(s.expectedResult)} |\n`
    })
  } else {
    out += `| 1 | *No detailed steps recorded* | - | - |\n`
  }

  out += `\n> [!CHECKLIST] Expected Outcome
> ${tc.expectedResults || 'No expected results defined.'}
`

  if (tc.expectedImages && tc.expectedImages.length > 0) {
    out += `\n##### 🖼️ Expected UI / Payload Evidence\n`
    tc.expectedImages.forEach((img, idx) => {
      out += `![Expected Result Reference ${idx + 1}](${img})\n\n`
    })
  }

  const actualCalloutType = tc.status === 'passed' ? 'SUCCESS' : tc.status === 'failed' ? 'DANGER' : tc.status === 'blocked' ? 'WARNING' : 'EXAMPLE'
  out += `\n> [!${actualCalloutType}] Actual Test Execution Result
> **Execution Status**: ${statusIcon} **${tc.status.toUpperCase()}**
> **Executed By**: \`${tc.executedBy || 'Not executed yet'}\` ${tc.executedAt ? `on \`${tc.executedAt}\`` : ''}
> 
> ${tc.actualResults ? tc.actualResults.replace(/\n/g, '\n> ') : '*No execution logs yet.*'}
`

  if (tc.actualImages && tc.actualImages.length > 0) {
    out += `\n##### 📸 Actual Execution Evidence / Screenshots\n`
    tc.actualImages.forEach((img, idx) => {
      out += `![Actual Execution Proof ${idx + 1}](${img})\n\n`
    })
  }

  out += `\n---\n\n`
  return out
}

/** a table cell can't hold a line break or a bare `|`; multi-line steps become `<br>` */
function mdCell(text: string, code = false): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\|/g, '\\|'))
    .filter(Boolean)
    .map((line) => (code ? `\`${line}\`` : line))
    .join('<br>')
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'passed':
      return '✅'
    case 'failed':
      return '❌'
    case 'blocked':
      return '🚫'
    case 'in_progress':
      return '⏳'
    default:
      return '⚪'
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Triggers browser download of a generated Markdown file
 */
export function downloadMarkdownFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename.endsWith('.md') ? filename : `${filename}.md`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// -----------------------------------------------------------------------------
// Word (.doc) download of a rendered document.
// Word opens HTML documents; the theme's CSS variables don't exist there, so the
// exported file carries its own fixed print styles (an export format, like the
// Markdown above — not app UI).
// -----------------------------------------------------------------------------
const WORD_CSS = `
body { font-family: 'TH Sarabun New', 'Noto Sans Thai', sans-serif; font-size: 14pt; color: #11142D; }
h1 { font-size: 20pt; margin: 4pt 0; } h2 { font-size: 15pt; color: #1E4DB7; margin: 14pt 0 6pt; } h3 { font-size: 13pt; margin: 8pt 0 4pt; }
table { width: 100%; border-collapse: collapse; margin-bottom: 6pt; }
th, td { border: 1px solid #C8CBD6; padding: 4pt 6pt; vertical-align: top; text-align: left; }
thead th { background: #E4EAF6; }
.doc-meta th, .doc-meta td { border: none; padding: 0 4pt; }
.doc-header { border-bottom: 2px solid #1E4DB7; padding-bottom: 8pt; }
.doc-title { text-align: center; margin: 18pt 0 6pt; } .doc-type { color: #1E4DB7; font-weight: bold; }
.doc-muted { color: #777E89; } .doc-small { font-size: 11pt; } .doc-center { text-align: center; }
.doc-callout { border-left: 4px solid #FEC90F; background: #FFF9E2; padding: 6pt 10pt; }
.doc-badge--passed { color: #1F8F57; } .doc-badge--failed { color: #D93654; } .doc-badge--blocked, .doc-badge--skipped { color: #C2621F; }
.doc-evidence img { width: 200px; } .doc-logo { width: 48px; height: 48px; }
.doc-signs { margin-top: 12pt; } .doc-sign { display: inline-block; width: 30%; text-align: center; vertical-align: top; }
.doc-sign__line { height: 30pt; border-bottom: 1px dotted #11142D; margin-bottom: 4pt; }
.doc-signed { color: #1F8F57; } .doc-rejected { color: #D93654; }
.doc-box { display: inline-block; width: 12pt; border: 1px solid #11142D; text-align: center; }
.doc-footer { border-top: 1px solid #C8CBD6; margin-top: 18pt; padding-top: 4pt; font-size: 10pt; color: #777E89; }
`

/** Download the rendered document element as a Word-compatible .doc file */
export function downloadWordDocument(filename: string, element: HTMLElement, title: string) {
  const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${title}</title><style>${WORD_CSS}</style></head><body>${element.outerHTML}</body></html>`
  const url = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename.endsWith('.doc') ? filename : `${filename}.doc` })
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
