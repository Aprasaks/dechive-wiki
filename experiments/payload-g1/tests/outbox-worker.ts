import { Pool } from 'pg'

// Disposable fault-injection worker. Killed by the orchestrator, never used in production.
const [operation, ...parameters] = process.argv.slice(2)
const mode = parameters.pop()
if (!['commit', 'pause-before-commit', 'pause-after-commit'].includes(mode ?? '')) {
  throw new Error('Unsupported fault-injection mode')
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const client = await pool.connect()

try {
  await client.query('BEGIN')
  if (operation === 'publish' && parameters.length === 3) {
    await client.query('SELECT kg.publish($1,$2,$3)', [
      parameters[0], parameters[1], Number(parameters[2]),
    ])
  } else if (operation === 'project' && parameters.length === 1) {
    await client.query('SELECT kg.project_event($1)', [Number(parameters[0])])
  } else {
    throw new Error('Invalid worker operation/argument count')
  }
  if (mode === 'pause-before-commit') {
    console.log('READY_BEFORE_COMMIT')
    await new Promise<void>(() => { setInterval(() => {}, 1000) })
  }

  await client.query('COMMIT')
  if (mode === 'pause-after-commit') {
    console.log('READY_AFTER_COMMIT')
    await new Promise<void>(() => { setInterval(() => {}, 1000) })
  }
  console.log('WORKER_COMMIT_OK')
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  if (mode === 'commit') {
    client.release()
    await pool.end()
  }
}
