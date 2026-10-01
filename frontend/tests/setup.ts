import { beforeEach } from 'vitest'

// every test starts from the seed data, signed in as nobody until it logs in
beforeEach(() => localStorage.clear())
