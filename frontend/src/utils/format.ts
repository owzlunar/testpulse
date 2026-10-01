/** 1234.5 -> "1,234.5" */
export const formatNumber = (n: number): string => n.toLocaleString('th-TH')

/** 87.456 -> "87.5%" */
export const formatPercent = (n: number, digits = 1): string => `${n.toFixed(digits)}%`

/** "ศุภชัย วัฒนา (Admin)" -> "ศุ" ; "Somchai Prasert" -> "SP" */
export function initials(name: string): string {
  const words = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  // Thai has no capitals and stacked marks: use the first two characters of the first word
  if (/[฀-๿]/.test(words[0])) return words[0].slice(0, 2)
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

/** "ศุภชัย วัฒนา (Admin)" -> "ศุภชัย" */
export const firstName = (name: string): string => name.split(' ')[0] ?? name

/** First letter for an avatar fallback: "PromptPay" -> "P" */
export const firstLetter = (text: string): string => text.trim().charAt(0).toUpperCase() || '?'
