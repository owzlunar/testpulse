import mongoose from 'mongoose'
import { describe, expect, it } from 'vitest'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { migrate, migrationStatus, type Migration } from '../migrations.js'

useTestDatabase()

const recorder = () => {
  const ran: string[] = []
  const make = (id: string, fail = false): Migration => ({
    id,
    description: id,
    up: async () => {
      if (fail) throw new Error(`${id} broke`)
      ran.push(id)
    },
  })
  return { ran, make }
}

describe('migrations', () => {
  it('run once each, in order, and are recorded', async () => {
    const { ran, make } = recorder()
    const list = [make('20260101-01-a'), make('20260102-01-b')]
    expect(await migrate(list)).toEqual(['20260101-01-a', '20260102-01-b'])
    expect(await migrate(list)).toEqual([])
    expect(ran).toEqual(['20260101-01-a', '20260102-01-b'])
    const status = await migrationStatus([...list, make('20260103-01-c')])
    expect(status.map((s) => [s.id, !!s.appliedAt])).toEqual([
      ['20260101-01-a', true],
      ['20260102-01-b', true],
      ['20260103-01-c', false],
    ])
  })

  it('stop at a failing migration and retry it next time', async () => {
    const { ran, make } = recorder()
    await expect(migrate([make('20260101-01-a'), make('20260102-01-b', true), make('20260103-01-c')])).rejects.toThrow('broke')
    expect(ran).toEqual(['20260101-01-a'])
    expect(await mongoose.connection.db!.collection('migrations').countDocuments()).toBe(1)
    expect(await migrate([make('20260101-01-a'), make('20260102-01-b'), make('20260103-01-c')])).toEqual(['20260102-01-b', '20260103-01-c'])
  })

  it('refuse a list out of order or with a repeated id', async () => {
    const { make } = recorder()
    await expect(migrate([make('20260102-01-b'), make('20260101-01-a')])).rejects.toThrow(/order/)
    await expect(migrate([make('20260101-01-a'), make('20260101-01-a')])).rejects.toThrow(/share an id/)
  })
})
