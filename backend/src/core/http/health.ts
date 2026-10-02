import { Router } from 'express'
import mongoose from 'mongoose'
import { databaseReady } from '../config/db.js'
import { appState } from '../app-state.js'

// Probes are not behind the rate limit or auth.
//   /health/live   the process answers (no database call, so a slow database never restarts the pod)
//   /health/ready  the database answers and the app is not shutting down

export const healthRouter = Router()

healthRouter.get('/health/live', (_req, res) => {
  res.json({ status: 'ok' })
})

healthRouter.get('/health/ready', async (_req, res) => {
  if (appState.shuttingDown) return void res.status(503).json({ status: 'unavailable', reason: 'shutting_down' })
  try {
    if (!databaseReady() || !mongoose.connection.db) throw new Error('not connected')
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000).unref()),
    ])
    res.json({ status: 'ok', database: 'connected' })
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'disconnected' })
  }
})
