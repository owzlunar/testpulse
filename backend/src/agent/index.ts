import { MongoClient } from 'mongodb'
import { Agent } from './agent.js'
import { Alerter } from './alerts.js'
import { loadConfig } from './config.js'
import { createAgentServer } from './http.js'
import { JobStore } from './jobs.js'
import { bashScriptRunner, Runner } from './runner.js'
import { SettingsStore } from './settings.js'
import { Storage } from './storage.js'

// The backup agent (PRD 5.15): `node dist/agent/index.js`. In the TestPulse image it runs either as a
// third supervisor program next to the API (BACKUP_AGENT=embedded) or as a container of its own from
// the same image (BACKUP_AGENT=separate); the code is the same, only the settings differ.

const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`)

async function dropDatabase(uri: string, db: string): Promise<void> {
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 })
  try {
    await client.db(db).dropDatabase()
  } finally {
    await client.close()
  }
}

function main(): void {
  const config = loadConfig()
  const settings = new SettingsStore(config.dataDir, config.secretKey, config.timezone)
  const jobs = new JobStore(config.dataDir)
  const alerter = new Alerter(config, settings, fetch, log)
  const storage = new Storage(config)
  // the agent is created below; the runner tells it when a job is done
  let agent: Agent | null = null
  const runner = new Runner(config, jobs, bashScriptRunner(config), dropDatabase, (job) => agent?.jobFinished(job))
  agent = new Agent(config, settings, jobs, runner, storage, alerter, log)

  const server = createAgentServer(agent)
  server.listen(config.port, config.host, () => {
    log(`[agent] backup agent (${config.mode}, tools: ${config.tools}) on ${config.host}:${config.port}, data in ${config.dataDir}`)
    if (!config.apiUrl) log('[agent] AGENT_API_URL is not set: no in-app notifications or emails, only Teams / Uptime Kuma')
  })
  agent.start()

  const shutdown = (signal: string) => {
    log(`[agent] ${signal}: stopping`)
    agent?.stop()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

try {
  main()
} catch (err) {
  console.error(`[agent] cannot start: ${(err as Error).message}`)
  process.exit(1)
}
