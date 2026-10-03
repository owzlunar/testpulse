import type { Express } from 'express'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftOptions, TestCaseDraft } from '#contract/types.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'
import { setDraftProvider } from '../ai.provider.js'
import { draftsFrom, ollamaProvider } from '../ollama.provider.js'

// user-qa-1 QA Lead (case.edit) · user-dev-1 Developer (no case.edit)

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())
afterEach(() => {
  setDraftProvider(null)
  vi.unstubAllGlobals()
})

const as = (userId: string) => client(app).as(userId)
const ALL: DraftOptions = { positive: true, negative: true, boundary: true }
const REQ = 'REQ-PAY-01: ผู้ใช้ชำระเงินผ่าน QR PromptPay'
const draft = (over: Partial<TestCaseDraft> = {}) => ({
  kind: 'positive',
  name: 'ชำระเงินสำเร็จ',
  testScenario: 'สแกน QR แล้วโอน',
  prerequisite: '',
  priority: 'high',
  steps: [{ action: 'สแกน QR', testData: '100 THB', expectedResult: 'โอนสำเร็จ' }],
  expectedResults: 'คำสั่งซื้อเป็น PAID',
  ...over,
})

describe('without a model (AI_PROVIDER=none)', () => {
  it('says AI is off and drafts nothing', async () => {
    expect((await as('user-dev-1').get('/ai/status')).body.data).toEqual({ enabled: false })
    const res = await as('user-qa-1').post('/ai/test-case-drafts').send({ requirement: REQ, options: ALL })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('ai_disabled')
  })
})

describe('with a model', () => {
  it('drafts for those who may write cases', async () => {
    setDraftProvider({ model: 'stub', draft: async (requirement) => [{ ...draft(), requirement } as TestCaseDraft] })
    expect((await as('user-dev-1').get('/ai/status')).body.data).toEqual({ enabled: true, model: 'stub' })
    expect((await as('user-dev-1').post('/ai/test-case-drafts').send({ requirement: REQ, options: ALL })).status).toBe(403)
    const res = await as('user-qa-1').post('/ai/test-case-drafts').send({ requirement: REQ, options: ALL })
    expect(res.body.data).toEqual([{ ...draft(), requirement: REQ }])
    const none = await as('user-qa-1')
      .post('/ai/test-case-drafts')
      .send({ requirement: REQ, options: { positive: false, negative: false, boundary: false } })
    expect(none.status).toBe(422)
  })
})

describe('Ollama', () => {
  const settings = { baseUrl: 'http://ollama.test:11434', model: 'qwen2.5:14b', timeoutMs: 5000 }

  it('is asked for structured JSON; the answer becomes drafts', async () => {
    const fetchMock = vi.fn(async () => Response.json({ message: { content: JSON.stringify({ cases: [draft()] }) } }))
    vi.stubGlobal('fetch', fetchMock)
    const drafts = await ollamaProvider(settings).draft(REQ, ALL)
    expect(drafts).toEqual([{ ...draft(), requirement: REQ }])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://ollama.test:11434/api/chat')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ model: 'qwen2.5:14b', stream: false, format: { required: ['cases'] } })
    expect(body.messages[1].content).toContain(REQ)
  })

  it('keeps only well-formed cases of the kinds asked for', () => {
    const answer = JSON.stringify({
      cases: [draft(), draft({ kind: 'boundary', name: 'ขอบเขต' }), { name: 'ไม่มีขั้นตอน', kind: 'negative' }, draft({ name: '  ตัดช่องว่าง  ' })],
    })
    const drafts = draftsFrom(answer, REQ, { positive: true, negative: true, boundary: false })
    expect(drafts.map((d) => d.name)).toEqual(['ชำระเงินสำเร็จ', 'ตัดช่องว่าง'])
    expect(() => draftsFrom('not json', REQ, ALL)).toThrow(/อ่านไม่ได้/)
  })

  it('unreachable or too slow: the user is told so', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    )
    await expect(ollamaProvider(settings).draft(REQ, ALL)).rejects.toMatchObject({ status: 503 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))),
    )
    await expect(ollamaProvider(settings).draft(REQ, ALL)).rejects.toMatchObject({ status: 504 })
  })
})
