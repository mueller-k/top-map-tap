import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import net from 'node:net'

const argumentsSet = new Set(process.argv.slice(2))
if (argumentsSet.has('--help')) {
  console.log('Usage: pnpm location-archive:backfill [--remote]')
  process.exit(0)
}
const unknown = [...argumentsSet].filter((argument) => argument !== '--remote')
if (unknown.length > 0) {
  console.error(`Unknown argument: ${unknown.join(', ')}`)
  process.exit(2)
}

const remote = argumentsSet.has('--remote')
const port = await availablePort()
const token = randomBytes(32).toString('base64url')
const commandArguments = [
  'exec', 'wrangler', 'dev',
  '--config', 'wrangler.location-backfill.jsonc',
  '--port', String(port),
  '--var', `BACKFILL_TOKEN:${token}`,
  '--log-level', 'error',
]
if (remote) commandArguments.push('--remote')

console.log(`Starting ${remote ? 'REMOTE' : 'local'} location backfill...`)
const wrangler = spawn('pnpm', commandArguments, {
  cwd: process.cwd(),
  env: { ...process.env, WRANGLER_LOG_PATH: '/tmp/top-map-tap-backfill-wrangler.log' },
  stdio: ['ignore', 'inherit', 'inherit'],
})

let cursor = null
let finalPayload = null
try {
  await waitForWorker(port, wrangler)
  while (true) {
    const url = new URL(`http://127.0.0.1:${port}/backfill`)
    if (cursor) url.searchParams.set('after', cursor)
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(`Backfill worker returned ${response.status}: ${JSON.stringify(payload)}`)
    if (payload.done) {
      finalPayload = payload
      break
    }
    if (typeof payload.processedThrough !== 'string') throw new Error('Backfill worker returned no cursor')
    cursor = payload.processedThrough
    console.log(`Processed through ${cursor}`)
  }
} finally {
  wrangler.kill('SIGTERM')
}

console.log(JSON.stringify({
  eligibleThrough: finalPayload.eligibleThrough,
  uncoveredDates: finalPayload.uncoveredDates,
  pendingEnrichmentCount: finalPayload.pendingEnrichmentCount,
}, null, 2))
if (finalPayload.uncoveredDates.length > 0) process.exitCode = 1

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a local port')))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

async function waitForWorker(port, processHandle) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`Wrangler exited with ${processHandle.exitCode}`)
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_000) })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  throw new Error('Timed out waiting for the backfill worker')
}
