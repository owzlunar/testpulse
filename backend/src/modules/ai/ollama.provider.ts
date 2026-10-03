import Joi from 'joi'
import type { DraftOptions, TestCaseDraft } from '#contract/types.js'
import { logger } from '#core/config/logger.js'
import { ApiError } from '#core/http/errors.js'
import type { DraftProvider } from './ai.provider.js'
import { ANSWER_SCHEMA, SYSTEM_PROMPT, userPrompt } from './ai.prompt.js'

// Drafts from a local Ollama server (POST /api/chat with a JSON schema as `format`). The model's
// answer is checked like any input: cases that don't fit the shape are dropped, texts are trimmed.

export interface OllamaSettings {
  baseUrl: string
  model: string
  timeoutMs: number
}

const short = (max: number) => Joi.string().trim().allow('').max(max).default('')
const draftSchema = Joi.object({
  kind: Joi.string().valid('positive', 'negative', 'boundary').required(),
  name: Joi.string().trim().min(1).max(200).required(),
  testScenario: short(2000),
  prerequisite: short(2000),
  priority: Joi.string().valid('critical', 'high', 'medium', 'low').default('medium'),
  steps: Joi.array()
    .items(Joi.object({ action: Joi.string().trim().min(1).max(1000).required(), testData: short(1000), expectedResult: short(1000) }))
    .min(1)
    .max(20)
    .required(),
  expectedResults: short(2000),
})

/** the cases of the model's answer that have the expected shape (and are of a kind that was asked for) */
export function draftsFrom(answer: string, requirement: string, options: DraftOptions): TestCaseDraft[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(answer)
  } catch {
    throw new ApiError(502, 'AI ตอบกลับในรูปแบบที่อ่านไม่ได้ ลองอีกครั้ง', 'ai_bad_answer')
  }
  const cases = (parsed as { cases?: unknown }).cases
  if (!Array.isArray(cases)) throw new ApiError(502, 'AI ตอบกลับในรูปแบบที่อ่านไม่ได้ ลองอีกครั้ง', 'ai_bad_answer')
  return cases.flatMap((c) => {
    const { value, error } = draftSchema.validate(c, { stripUnknown: true })
    if (error || !options[value.kind as 'positive' | 'negative' | 'boundary']) return []
    return [{ ...(value as Omit<TestCaseDraft, 'requirement'>), requirement }]
  })
}

export function ollamaProvider({ baseUrl, model, timeoutMs }: OllamaSettings): DraftProvider {
  return {
    model,
    async draft(requirement, options) {
      let res: Response
      try {
        res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            format: ANSWER_SCHEMA,
            options: { temperature: 0.2 },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt(requirement, options) },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (err) {
        const timedOut = (err as Error).name === 'TimeoutError'
        logger.warn(`[ai] Ollama ${timedOut ? 'timed out' : 'unreachable'}: ${(err as Error).message}`)
        throw new ApiError(
          timedOut ? 504 : 503,
          timedOut ? 'AI ใช้เวลานานเกินไป ลองอีกครั้งหรือลดขอบเขต' : 'ติดต่อ AI ไม่ได้ในขณะนี้',
          'ai_unavailable',
        )
      }
      if (!res.ok) {
        logger.warn(`[ai] Ollama answered ${res.status}: ${(await res.text()).slice(0, 300)}`)
        throw new ApiError(502, 'AI ไม่สามารถร่างเคสได้ในขณะนี้', 'ai_unavailable')
      }
      const body = (await res.json()) as { message?: { content?: string } }
      return draftsFrom(body.message?.content ?? '', requirement, options)
    },
  }
}
