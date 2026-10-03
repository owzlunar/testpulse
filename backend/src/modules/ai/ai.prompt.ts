import type { DraftOptions } from '#contract/types.js'

// What the model is asked, and the JSON shape its answer must have (Ollama's structured outputs).

const KINDS = {
  positive: 'positive (the main flow works as the requirement says)',
  negative: 'negative (invalid input, missing permission, failures of other systems)',
  boundary: 'boundary (minimum, maximum, empty and just-out-of-range values)',
} as const

export const SYSTEM_PROMPT = [
  'You are a senior QA engineer. You write manual test cases for a requirement.',
  'Write every text field in Thai; keep technical terms (API, OTP, QR, HTTP codes) as they are.',
  'Each case has a short name, a scenario, a prerequisite, a priority (critical, high, medium or low),',
  '2 to 6 concrete steps (action, test data, expected result) and the overall expected result.',
  'Only describe what can be checked from the requirement; never invent features it does not mention.',
  'Answer with JSON only.',
].join(' ')

export function userPrompt(requirement: string, options: DraftOptions): string {
  const kinds = (Object.keys(KINDS) as (keyof typeof KINDS)[]).filter((k) => options[k]).map((k) => `- ${KINDS[k]}`)
  return [
    `Requirement:\n${requirement.trim()}`,
    options.context?.trim() ? `Context:\n${options.context.trim()}` : '',
    `Write 1 to 3 test cases of each kind below, and set "kind" on each:\n${kinds.join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

const text = { type: 'string' }

/** JSON schema of the answer: { cases: [...] } */
export const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    cases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['positive', 'negative', 'boundary'] },
          name: text,
          testScenario: text,
          prerequisite: text,
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: { action: text, testData: text, expectedResult: text },
              required: ['action', 'testData', 'expectedResult'],
            },
          },
          expectedResults: text,
        },
        required: ['kind', 'name', 'testScenario', 'prerequisite', 'priority', 'steps', 'expectedResults'],
      },
    },
  },
  required: ['cases'],
}
