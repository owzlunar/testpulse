import { computed, ref, type Ref } from 'vue'
import { parseDelimited } from '@/utils/table'

/** a field the table may fill: header names it recognises, and whether the import needs it */
export interface ImportField<K extends string> {
  key: K
  label: string
  required?: boolean
  aliases: string[]
}

/**
 * The common part of the import wizards (test cases, requirements): text pasted from Excel / Google
 * Sheets or read from a CSV file, its header, and which column fills which field (matched from the
 * header names, editable).
 */
export function useTableImport<K extends string>(fields: ImportField<K>[]) {
  const source = ref<'paste' | 'file'>('paste')
  const text = ref('')
  const fileName = ref('')
  const hasHeader = ref(true)

  function reset() {
    text.value = ''
    fileName.value = ''
  }

  function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    fileName.value = file.name
    file.text().then((t) => (text.value = t))
  }

  const rows = computed(() => parseDelimited(text.value))
  const header = computed(() => (hasHeader.value ? (rows.value[0] ?? []) : (rows.value[0] ?? []).map((_, i) => `คอลัมน์ ${i + 1}`)))
  const body = computed(() => (hasHeader.value ? rows.value.slice(1) : rows.value))
  /** the file's row number of a body row (for messages) */
  const rowNumber = (i: number) => i + (hasHeader.value ? 2 : 1)

  const mapping = ref({}) as Ref<Record<K, number | null>>

  /** columns by header name; headerless data is taken in the fields' order */
  function autoMap() {
    const names = header.value.map((h) => h.toLowerCase().trim())
    mapping.value = Object.fromEntries(
      fields.map((f, i) => {
        const exact = names.findIndex((n) => f.aliases.includes(n))
        return [f.key, exact >= 0 ? exact : !hasHeader.value && i < names.length ? i : null]
      }),
    ) as Record<K, number | null>
  }

  const columnOptions = computed(() => header.value.map((h, i) => ({ title: h || `คอลัมน์ ${i + 1}`, value: i })))

  /** a row's value for a field ('' when the field has no column) */
  const cell = (row: string[], field: K) => {
    const col = mapping.value[field]
    return col === null || col === undefined ? '' : (row[col] ?? '')
  }

  /** the first non-empty value of a field, to show next to its column */
  const sample = (field: K) => body.value.map((r) => cell(r, field)).find(Boolean) ?? ''

  const mappingValid = computed(() =>
    fields.filter((f) => f.required).every((f) => mapping.value[f.key] !== null && mapping.value[f.key] !== undefined),
  )

  return {
    source,
    text,
    fileName,
    hasHeader,
    reset,
    onFile,
    rows,
    header,
    body,
    rowNumber,
    mapping,
    autoMap,
    columnOptions,
    cell,
    sample,
    mappingValid,
  }
}
