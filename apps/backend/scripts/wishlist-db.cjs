// Operational preflight only. Never prints configuration or credentials.
require('ts-node/register/transpile-only')

const assert = require('node:assert/strict')
const { configLoader } = require('@medusajs/framework/config')
const { Client } = require('@medusajs/framework/pg')
const { createRequire } = require('node:module')
const { readdirSync, existsSync } = require('node:fs')
const { dirname, join } = require('node:path')

async function main() {
  const config = await configLoader(process.cwd())
  const url = new URL(config.projectConfig.databaseUrl)
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Unexpected database host')
  assert.equal(url.port, '5433', 'Unexpected database port')
  assert.equal(url.pathname, '/rigby_medusa', 'Unexpected database name')
  const client = new Client({ connectionString: url.toString() })
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const { rows } = await client.query('select current_database() as database')
    assert.equal(rows[0].database, 'rigby_medusa')
    const tables = await client.query("select tablename from pg_tables where schemaname = 'public' and (tablename like '%migration%' or tablename like '%wishlist%') order by tablename")
    const indexes = await client.query("select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('wishlist', 'wishlist_item') order by indexname")
    const executed = await client.query('select name from mikro_orm_migrations')
    const names = new Set(executed.rows.map(row => row.name.replace(/\.(js|ts)$/, '')))
    const frameworkRequire = createRequire(require.resolve('@medusajs/framework'))
    const { ModulesDefinition } = frameworkRequire('@medusajs/modules-sdk')
    const pending = []
    for (const definition of Object.values(ModulesDefinition)) {
      if (!definition.defaultPackage) continue
      const entry = frameworkRequire.resolve(definition.defaultPackage)
      const migrations = join(dirname(entry), 'migrations')
      if (!existsSync(migrations)) continue
      for (const file of readdirSync(migrations)) {
        if (!/^Migration.*\.js$/.test(file)) continue
        if (!names.has(file.replace(/\.js$/, ''))) pending.push({ module: definition.key, migration: file })
      }
    }
    await client.query('ROLLBACK')
    console.log(JSON.stringify({ target: 'localhost:5433/rigby_medusa', verified: true, tables: tables.rows, indexes: indexes.rows, pendingCoreMigrations: pending }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch(() => {
  console.error('Wishlist database preflight failed; no credentials or connection details emitted')
  process.exitCode = 1
})
