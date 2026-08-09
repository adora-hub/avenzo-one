import { rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(scriptDirectory, '..')
const nextCache = resolve(webRoot, '.next')
const devPort = 3000

async function assertPortAvailable(port) {
  await new Promise((resolvePromise, rejectPromise) => {
    const probe = createServer()
    probe.unref()
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        rejectPromise(new Error(`[dev] Port ${port} is already in use. Keep the existing Local Server running; this command did not clear .next.`))
        return
      }
      rejectPromise(error)
    })
    probe.listen({ port }, () => {
      probe.close(resolvePromise)
    })
  })
}

try {
  await assertPortAvailable(devPort)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

if (dirname(nextCache) !== webRoot) {
  throw new Error(`Refusing to remove an unsafe cache path: ${nextCache}`)
}

rmSync(nextCache, { recursive: true, force: true })
console.log('[dev] Cleared generated Next.js cache before startup.')

const nextBin = resolve(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(devPort)], {
  cwd: webRoot,
  env: process.env,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (error) => {
  console.error('[dev] Failed to start Next.js:', error)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1)
})
