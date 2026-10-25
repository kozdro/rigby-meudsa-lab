// Explicit, process-scoped replay launcher. Never writes connection settings.
require('ts-node/register/transpile-only')

const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { resolve } = require('node:path')
const { dirname, join } = require('node:path')
const { readdirSync, existsSync } = require('node:fs')
const { createRequire } = require('node:module')
const { configLoader } = require('@medusajs/framework/config')
const { Client } = require('@medusajs/framework/pg')

async function main() {
  const config = await configLoader(process.cwd())
  const source = new URL(config.projectConfig.databaseUrl)
  assert.ok(['localhost', '127.0.0.1'].includes(source.hostname), 'Local source required')
  assert.equal(source.port, '5433', 'Expected project PostgreSQL port')
  assert.equal(source.pathname, '/rigby_medusa', 'Expected original development database')
  const replay = new URL(source)
  replay.pathname = '/rigby_medusa_replay'
  const client = new Client({ connectionString: replay.toString() })
  await client.connect()
  let publishableKey
  try {
    await client.query('BEGIN READ ONLY')
    const identity = await client.query('select current_database() as name, oid from pg_database where datname = current_database()')
    assert.equal(identity.rows[0].name, 'rigby_medusa_replay', 'Replay identity required')
    assert.notEqual(Number(identity.rows[0].oid), 16384, 'Original database forbidden')
    const keys = await client.query("select token from api_key where type = 'publishable' and revoked_at is null and deleted_at is null limit 1")
    publishableKey = keys.rows[0]?.token
    assert.ok(publishableKey, 'Existing publishable key required')
    if (process.argv[2] === 'medusa' && process.argv[3] === 'db:migrate') {
      const executed = await client.query('select name from mikro_orm_migrations')
      const names = new Set(executed.rows.map(row => row.name.replace(/\.(js|ts)$/, '')))
      const frameworkRequire = createRequire(require.resolve('@medusajs/framework'))
      const { ModulesDefinition } = frameworkRequire('@medusajs/modules-sdk')
      const unexpected = []
      for (const definition of Object.values(ModulesDefinition)) {
        if (!definition.defaultPackage) continue
        const migrations = join(dirname(frameworkRequire.resolve(definition.defaultPackage)), 'migrations')
        if (!existsSync(migrations)) continue
        for (const file of readdirSync(migrations)) {
          if (/^Migration.*\.js$/.test(file) && !names.has(file.replace(/\.js$/, ''))) {
            unexpected.push(`${definition.key}/${file}`)
          }
        }
      }
      assert.equal(unexpected.length, 0, 'Unapproved pending core migrations; stop for inspection')
      console.log(JSON.stringify({ unapprovedPendingCoreMigrations: unexpected.length }))
    }
    await client.query('ROLLBACK')
    console.log(JSON.stringify({ database: identity.rows[0].name, oid: identity.rows[0].oid, verified: true }))
  } finally {
    await client.end()
  }

  const mode = process.argv[2]
  const env = {
    ...process.env,
    DATABASE_URL: replay.toString(),
    RIGBY_REPLAY: '1',
    JWT_SECRET: randomBytes(32).toString('hex'),
    COOKIE_SECRET: randomBytes(32).toString('hex'),
    STORE_CORS: 'http://127.0.0.1:3100',
    ADMIN_CORS: 'http://127.0.0.1:9100',
    AUTH_CORS: 'http://127.0.0.1:3100,http://127.0.0.1:9100',
    NUXT_PUBLIC_MEDUSA_BACKEND_URL: 'http://127.0.0.1:9100',
    NUXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: publishableKey,
  }
  let args
  let executable = 'pnpm'
  let cwd = process.cwd()
  if (mode === 'backend') args = ['exec', 'medusa', 'develop', '--port', '9100']
  else if (mode === 'storefront') {
    cwd = resolve(process.cwd(), '../storefront')
    executable = process.execPath
    args = ['.output/server/index.mjs']
    env.NITRO_HOST = '127.0.0.1'
    env.NITRO_PORT = '3100'
  } else if (mode === 'medusa') args = ['exec', 'medusa', ...process.argv.slice(3)]
  else if (mode === 'inspect') return
  else throw new Error('Use inspect, backend, storefront, or medusa <arguments>')
  const child = spawn(executable, args, { cwd, env, detached: true, stdio: 'inherit' })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    if (child.pid) {
      try { process.kill(-child.pid, signal) } catch { /* Child has already exited. */ }
    }
  })
  child.on('exit', code => { process.exitCode = code ?? 1 })
}

main().catch(() => {
  console.error('Replay launcher failed; connection settings and credentials withheld')
  process.exitCode = 1
})
