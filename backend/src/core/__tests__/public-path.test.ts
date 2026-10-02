import { describe, expect, it } from 'vitest'

// Behind a reverse proxy on a sub path (BASE_URL=https://mydomain/testpulse), everything the browser
// is told to use carries the sub path; the API itself still listens on BASE_PATH.
process.env.BASE_URL = 'https://mydomain.example/testpulse/'

const { config } = await import('../config/env.js')

describe('public path', () => {
  it('derives the public paths and origin from BASE_URL', () => {
    expect(config.baseUrl).toBe('https://mydomain.example/testpulse')
    expect(config.appOrigin).toBe('https://mydomain.example')
    expect(config.publicPath).toBe('/testpulse')
    expect(config.publicApiPath).toBe('/testpulse/api/v1')
    expect(config.basePath).toBe('/api/v1')
  })
})
