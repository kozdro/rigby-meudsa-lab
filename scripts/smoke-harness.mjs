import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { createInterface } from "node:readline"
import { codexRead, root } from "./codex-rpc.mjs"

const selected = process.argv.slice(2)
if (selected[0] === "--") selected.shift()
assert.ok(selected.every(s => ["A", "B"].includes(s)), "Use A or B; C requires an interactive chat")
const scenarios = selected.length ? [...new Set(selected)] : ["A", "B"]
const run = join(root, ".harness-runs", `${Date.now()}-${process.pid}`)
mkdirSync(run, { recursive: true })
console.log("Smoke evidence directory:", run)
console.log("Real fresh Codex CLI calls, inherited models, normal usage. C and current VS Code are verified separately.")

async function command(cmd, args, logPath, timeoutMs = 120000) {
  const log = createWriteStream(logPath)
  const child = spawn(cmd, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  let output = ""
  const capture = chunk => { output += chunk }
  child.stdout.on("data", capture)
  child.stderr.on("data", capture)
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs)
  try {
    const result = await new Promise((resolve, reject) => {
      child.on("error", reject)
      child.on("close", (exitCode, signal) => resolve({ exitCode, signal }))
    })
    return { command: [cmd, ...args].join(" "), ...result, output }
  } finally {
    clearTimeout(timer)
    log.end()
  }
}

// Fingerprint tracked and untracked app source/config without reading any env files.
async function appFingerprint() {
  const result = await command("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "apps", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"], join(run, "file-list.log"))
  assert.equal(result.exitCode, 0)
  const hash = createHash("sha256")
  for (const path of result.output.split("\0").filter(Boolean).sort()) {
    if (path.split("/").some(part => part.startsWith(".env")) || /\.(pem|key)$/.test(path)) continue
    hash.update(path)
    try { hash.update(readFileSync(join(root, path))) } catch (error) {
      if (error.code !== "ENOENT") throw error
      hash.update("MISSING")
    }
  }
  return hash.digest("hex")
}

function readRecords(path) {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
}

async function inspectRuntime(threadId, dir, scenario) {
  const { thread } = await codexRead("thread/read", { threadId, includeTurns: true })
  const records = readRecords(thread.path)
  writeFileSync(join(dir, "parent-rollout.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n")
  const calls = new Map()
  const spawns = []
  for (const record of records) {
    const p = record.payload
    if (record.type !== "response_item") continue
    if (p.type === "function_call" && p.name === "spawn_agent") {
      const args = JSON.parse(p.arguments)
      calls.set(p.call_id, { role: args.agent_type, task: args.task_name })
    }
    if (p.type === "function_call_output" && calls.has(p.call_id)) {
      let result
      try { result = JSON.parse(p.output) } catch { continue }
      if (result.task_name) spawns.push({ ...calls.get(p.call_id), path: result.task_name })
    }
  }
  const activities = thread.turns.flatMap(t => t.items).filter(i => i.type === "subAgentActivity")
  const agents = []
  const intervals = []
  for (const spawned of spawns) {
    const activity = activities.find(a => a.agentPath === spawned.path)
    assert.ok(activity, `No separate child evidence for ${spawned.path}`)
    const { thread: agent } = await codexRead("thread/read", { threadId: activity.agentThreadId, includeTurns: true })
    assert.equal(agent.agentRole, spawned.role, `Wrong loaded role for ${spawned.path}`)
    const childRecords = readRecords(agent.path)
    const childCalls = childRecords.filter(r => r.type === "response_item" && ["function_call", "custom_tool_call"].includes(r.payload.type)).map(r => r.payload)
    assert.ok(!childCalls.some(c => c.name === "spawn_agent" || /(?:tools|collaboration)\.spawn_agent\s*\(/.test(c.input || "")), `Nested delegation: ${spawned.path}`)
    for (const turn of agent.turns) {
      assert.equal(turn.status, "completed", `Incomplete child turn: ${spawned.path}`)
      assert.ok(turn.startedAt && turn.completedAt, "Missing runtime turn timing")
      intervals.push({ start: turn.startedAt, end: turn.completedAt, role: spawned.role })
    }
    let verdict
    if (spawned.role.endsWith("-reviewer")) {
      const messages = agent.turns.flatMap(t => t.items).filter(i => i.type === "agentMessage")
      const final = messages.at(-1)?.text || ""
      assert.match(final, /\bNO_FINDINGS\b/, `Unresolved or missing reviewer verdict: ${spawned.path}`)
      assert.doesNotMatch(final, /\b(CHANGES_REQUESTED|BLOCKED)\b/, `Reviewer has unresolved findings: ${spawned.path}`)
      verdict = "NO_FINDINGS"
      assert.ok(!agent.turns.flatMap(t => t.items).some(i => i.type === "fileChange"), `Reviewer file edit: ${spawned.path}`)
      assert.ok(!childCalls.some(c => c.name === "apply_patch" || /tools\.apply_patch\s*\(/.test(c.input || "")), `Reviewer attempted patch: ${spawned.path}`)
    }
    writeFileSync(join(dir, `child-${agents.length}.jsonl`), childRecords.map(r => JSON.stringify(r)).join("\n") + "\n")
    agents.push({ ...spawned, threadId: agent.id, completed: agent.turns.some(t => t.status === "completed"), ...(verdict ? { verdict } : {}) })
  }
  const required = scenario === "A" ? ["nuxt-specialist", "frontend-reviewer"]
    : ["explorer", "medusa-specialist", "nuxt-specialist", "qa-engineer", "backend-reviewer", "frontend-reviewer"]
  const allowed = scenario === "A" ? [...required, "explorer"] : required
  assert.ok(agents.length > 0, "No real delegations")
  for (const role of required) assert.ok(agents.some(a => a.role === role && a.completed), `Required typed child missing/incomplete: ${role}`)
  assert.ok(agents.every(a => allowed.includes(a.role) && a.completed), "Unexpected role or incomplete child")
  assert.equal(new Set(agents.map(a => a.threadId)).size, agents.length, "Child IDs must be independent")
  // Seconds-resolution app-server timestamps: touching intervals are not overlap.
  const points = intervals.flatMap(i => [{ time: i.start, delta: 1 }, { time: i.end, delta: -1 }])
    .sort((a, b) => a.time - b.time || a.delta - b.delta)
  let active = 0
  let maxConcurrent = 0
  for (const point of points) {
    active += point.delta
    maxConcurrent = Math.max(maxConcurrent, active)
  }
  assert.ok(maxConcurrent <= 3, `Too many concurrent subagents: ${maxConcurrent}`)
  return { threadId, agents, intervals, maxConcurrent, runtimeVerified: true,
    policyAudit: "Read-only commands, file ownership, QA design order and review conclusions require trace inspection" }
}

const common = `Follow project AGENTS.md Harness v2 and automatically choose only roles warranted by scope/risk.
This is an authorized test-only task, not production app development. Use actual configured agent types;
if a role is unavailable, report UNSUPPORTED, never impersonate it with a generic role.
No nested delegation; at most 3 concurrent children. You share the workspace; preserve others' changes.
No .env/secrets, DB, wishlist edits, dependencies, manifests, lockfile, commits, pushes or deployment.
Do not run the project's harness scripts recursively. Do not modify harness/config/docs.
Treat the fixed scaffolding as read-only. Only explicitly allowed files below may be created/edited.
State observable criteria, ownership and dependencies. Give each child original criteria, shared
contract, forbidden actions and checks. Review actual source including ignored fixture files;
git diff does not show these new files. QA owns tests, implementers own implementation.
Reviewers never edit or run mutating commands. Return actual child IDs, roles, checks and limitations.
No extra questions/documents for these clear requirements. Keep implementation small.
This is a loopback HTTP/Vue SSR fixture, not proof of live Medusa/Nuxt/browser integration.`

try {
  const before = await appFingerprint()
  const summaries = []
  for (const scenario of scenarios) {
    const dir = join(run, scenario)
    mkdirSync(join(dir, "tests"), { recursive: true })
    const rel = relative(root, dir)
    writeFileSync(join(dir, "runtime.mjs"), `import { createRequire } from "node:module"\nconst require = createRequire(new URL("../../../apps/storefront/package.json", import.meta.url))\nexport const { h, createSSRApp } = require("vue")\nexport const { renderToString } = require("vue/server-renderer")\n`)
    const detail = scenario === "A" ? `
Task A: Implement a simple frontend-only test notice using installed Vue SSR.
Allowed implementation file: ${rel}/frontend.mjs only; no test-authoring changes needed.
Export async function renderNotice() returning HTML from Vue renderToString/createSSRApp/h,
importing these from ./runtime.mjs. Output one p with role="status" and exact text
"Sklep testowy — katalog jest pusty.". No HTTP, backend or product app changes.
Run node --test ${rel}/acceptance.test.mjs after implementation, then independent review.
` : `
Task B: Implement a small end-to-end test notice via real loopback HTTP -> Vue SSR.
Allowed implementation files: ${rel}/backend.mjs, ${rel}/frontend.mjs.
Allowed independently authored tests: ${rel}/tests/notice.test.mjs only.
Tests must derive from ALL original criteria below, including failure boundaries,
with test design before implementation completion. Run tests only after dependencies exist.
Agree contract and assign files before parallel implementation; review follows test execution.
Backend exports createNoticeServer({ message }) using node:http, returns an UNSTARTED server.
GET /notice -> status 200 JSON { message: trimmed string }; missing/non-string/blank -> "".
Other methods or paths -> status 404 JSON. Do not listen except from tests, use 127.0.0.1 port 0.
Frontend exports async renderNotice(baseUrl), fetches baseUrl + '/notice'; non-2xx throws.
Success -> Vue SSR p role="status" with message; empty -> "Brak aktualnych komunikatów.".
Vue must escape untrusted message text (e.g. <script>), never raw HTML.
Use installed Vue exports from ./runtime.mjs. No mocks for the positive HTTP-to-SSR case.
QA tests use node:test/assert, own ephemeral servers, finally-close connections and leave no processes.
Run node --test ${rel}/tests/notice.test.mjs and node --test ${rel}/acceptance.test.mjs.
`
    const prompt = common + detail
    writeFileSync(join(dir, "prompt.md"), prompt)
    const acceptance = scenario === "A" ? `
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderNotice } from './frontend.mjs'
test('A: actual Vue SSR notice', async () => {
 assert.equal(await renderNotice(), '<p role="status">Sklep testowy — katalog jest pusty.</p>')
})
` : `
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createNoticeServer } from './backend.mjs'
import { renderNotice } from './frontend.mjs'
async function withServer(server, fn) {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
 try { await fn('http://127.0.0.1:' + server.address().port) }
 finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
 }
}
test('B: HTTP contract and Vue SSR text escaping', async () => {
 await withServer(createNoticeServer({message:'  <script>alert(1)</script>  '}), async base => {
  const r = await fetch(base+'/notice')
  assert.equal(r.status,200)
  assert.match(r.headers.get('content-type'), /application\\/json/)
  assert.deepEqual(await r.json(), {message:'<script>alert(1)</script>'})
  assert.equal(await renderNotice(base), '<p role="status">&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  for (const [path, method] of [['/missing','GET'], ['/notice','POST']]) {
   const error = await fetch(base+path, {method})
   assert.equal(error.status,404)
   await error.json()
  }
 })
})
test('B: missing, non-string and blank input fall back', async () => {
 for (const message of [undefined, 123, '   ', '']) {
  await withServer(createNoticeServer({message}), async base => {
   assert.deepEqual(await (await fetch(base+'/notice')).json(), {message:''})
   assert.equal(await renderNotice(base), '<p role="status">Brak aktualnych komunikatów.</p>')
  })
 }
})
test('B: upstream HTTP errors propagate', async () => {
 await withServer(createServer((req,res) => {
  res.writeHead(503)
  res.end('{}')
 }), async base => {
  await assert.rejects(() => renderNotice(base))
 })
})
`
    writeFileSync(join(dir, "acceptance.test.mjs"), acceptance)
    const scaffolding = ["runtime.mjs", "prompt.md", "acceptance.test.mjs"]
    const hashes = scaffolding.map(p => readFileSync(join(dir, p), "utf8"))
    console.log(`Scenario ${scenario}: launching actual Codex; requirements-only routing prompt`)
    const trace = createWriteStream(join(dir, "events.jsonl"))
    const stderr = createWriteStream(join(dir, "stderr.log"))
    const child = spawn("codex", ["exec", "--json", "--sandbox", "workspace-write", "-c", 'approval_policy="never"',
      // B needs loopback listeners for its real HTTP test; do not change project/global defaults.
      ...(scenario === "B" ? ["-c", "sandbox_workspace_write.network_access=true"] : []), "-"], { cwd: root, stdio: ["pipe", "pipe", "pipe"] })
    child.stdout.pipe(trace)
    child.stderr.pipe(stderr)
    let threadId
    createInterface({ input: child.stdout }).on("line", line => {
      try {
        const event = JSON.parse(line)
        if (event.type === "thread.started") threadId = event.thread_id
      } catch { /* non-JSON output cannot prove anything */ }
    })
    const timer = setTimeout(() => child.kill("SIGTERM"), 20 * 60 * 1000)
    child.stdin.end(prompt)
    const result = await new Promise((resolve, reject) => {
      child.on("error", reject)
      child.on("close", (exitCode, signal) => resolve({ exitCode, signal }))
    }).finally(() => clearTimeout(timer))
    assert.equal(result.exitCode, 0, `Scenario ${scenario}: Codex exit ${result.exitCode}, signal ${result.signal}`)
    assert.ok(threadId, "No actual parent thread ID")
    const summary = { scenario, ...result, ...await inspectRuntime(threadId, dir, scenario), commands: [] }
    scaffolding.forEach((p, i) => assert.equal(readFileSync(join(dir, p), "utf8"), hashes[i], `Scaffolding modified: ${p}`))
    const testPaths = [join(dir, "acceptance.test.mjs")]
    if (scenario === "B") testPaths.push(join(dir, "tests/notice.test.mjs"))
    const gate = await command("node", ["--test", "--test-reporter=tap", ...testPaths], join(dir, "tests.log"))
    const passed = Number(gate.output.match(/# pass (\d+)/)?.[1] || 0)
    const failed = Number(gate.output.match(/# fail (\d+)/)?.[1] ?? -1)
    summary.commands.push({ ...gate, output: undefined, passed, failed })
    summary.qaVerified = gate.exitCode === 0 && !gate.signal && passed >= (scenario === "A" ? 1 : 4) && failed === 0
    summary.appSourceUnchanged = before === await appFingerprint()
    writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
    console.log(JSON.stringify(summary, null, 2))
    assert.ok(summary.qaVerified, `Scenario ${scenario}: independent tests failed`)
    assert.ok(summary.appSourceUnchanged, "App/config/lockfile scope changed")
    summaries.push(summary)
  }
  writeFileSync(join(run, "summary.json"), JSON.stringify({ scenarios: summaries, C: "INTERACTIVE_ONLY", vscode: "NOT_VERIFIED_BY_CLI" }, null, 2) + "\n")
  console.log("SMOKE_VERIFIED: actual typed routing and independent fixture assertions passed. Inspect traces for ownership/order/review findings. C and VS Code are separate.")
} catch (error) {
  console.error("SMOKE_FAILED:", error.message)
  console.error("Inspect actual evidence:", run)
  process.exitCode = 1
}
