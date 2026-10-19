import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, createWriteStream } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { codexRead, root } from "./codex-rpc.mjs"

const evidence = mkdtempSync(join(tmpdir(), "rigby-harness-"))
const trace = createWriteStream(join(evidence, "events.jsonl"))
const stderr = createWriteStream(join(evidence, "stderr.log"))
console.log("Smoke evidence directory:", evidence)
console.log("Real Codex calls with inherited model settings; uses normal Codex usage.")
// Persisted context is required: CLI 0.159.3 cannot fork --ephemeral context.
const child = spawn("codex", [
  "exec", "--json", "--sandbox", "workspace-write",
  "-c", 'approval_policy="never"', "-",
], { cwd: root, stdio: ["pipe", "pipe", "pipe"] })
child.stdout.pipe(trace)
child.stderr.pipe(stderr)
let threadId
const items = new Map()
async function runGate(name, args) {
  const log = createWriteStream(join(evidence, `${name}.log`))
  let output = ""
  const process = spawn("pnpm", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
  const capture = (chunk) => { output += chunk; log.write(chunk) }
  process.stdout.on("data", capture)
  process.stderr.on("data", capture)
  const timeout = setTimeout(() => process.kill("SIGTERM"), 120000)
  try {
    const result = await new Promise((resolve, reject) => {
      process.on("error", reject)
      process.on("close", (exitCode, signal) => resolve({ exitCode, signal }))
    })
    const tests = output.match(/Tests:\s+(\d+) passed,\s+(\d+) total/)
    return {
      name, command: ["pnpm", ...args].join(" "), ...result,
      ...(name === "test" ? { passed: Number(tests?.[1] || 0), total: Number(tests?.[2] || 0) } : {}),
    }
  } finally {
    clearTimeout(timeout)
    log.end()
  }
}
const timer = setTimeout(() => {
  console.error("SMOKE_TIMEOUT")
  child.kill("SIGTERM")
}, 15 * 60 * 1000)
child.on("error", (error) => {
  clearTimeout(timer)
  console.error("SMOKE_START_FAILED:", error.message)
  process.exitCode = 1
})
createInterface({ input: child.stdout }).on("line", (line) => {
  let event
  try { event = JSON.parse(line) } catch { return }
  if (event.type === "thread.started") threadId = event.thread_id
  if (event.item) items.set(event.item.id, event.item)
})
child.on("close", async (code, signal) => {
  clearTimeout(timer)
  try {
    if (code !== 0 || signal || !threadId) throw new Error(`Codex exit ${code}, signal ${signal}`)
    const { thread } = await codexRead("thread/read", { threadId, includeTurns: true })
    // Inspect only this run's own runtime trace, never search other sessions.
    const records = readFileSync(thread.path, "utf8").trim().split("\n").map(JSON.parse)
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
    for (const spawn of spawns) {
      const activity = activities.find(a => a.agentPath === spawn.path)
      if (!activity) throw new Error(`No independent thread evidence for ${spawn.role}`)
      const { thread: agent } = await codexRead("thread/read", {
        threadId: activity.agentThreadId, includeTurns: true,
      })
      if (agent.agentRole !== spawn.role) throw new Error(`Wrong loaded role for ${spawn.path}`)
      agents.push({
        ...spawn, threadId: agent.id,
        completed: agent.turns.some(t => t.status === "completed"),
      })
    }
    const required = ["explorer", "medusa-specialist", "nuxt-specialist", "reviewer"]
    const runtimeVerified = required.every(role => agents.some(a => a.role === role && a.completed))
    if (!runtimeVerified) throw new Error("Required typed child completion evidence is incomplete")
    // Execute fixed gates ourselves. Agent prose, echo/help output and arbitrary
    // commands in the model trace cannot satisfy these checks.
    const commands = []
    for (const [name, args] of [
      ["test", ["test"]],
      ["lint", ["--dir", "apps/storefront", "run", "lint"]],
      ["typecheck", ["--dir", "apps/storefront", "run", "typecheck"]],
    ]) commands.push(await runGate(name, args))
    const tests = commands.find(c => c.name === "test")
    const qaVerified = commands.every(c => c.exitCode === 0 && !c.signal)
      && tests.total > 0 && tests.passed === tests.total
    const summary = { threadId, codexExitCode: code, agents, commands, runtimeVerified, qaVerified }
    writeFileSync(join(evidence, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
    console.log(JSON.stringify(summary, null, 2))
    const final = [...items.values()].filter(i => i.type === "agent_message").at(-1)
    if (final) console.log(final.text)
    if (!runtimeVerified || !qaVerified) throw new Error("Required runtime/QA evidence is incomplete")
    console.log("SMOKE_VERIFIED: real typed child threads completed; requested QA commands exited 0")
    console.log("This does not establish full product/browser/DB readiness or replace review findings.")
  } catch (error) {
    console.error("SMOKE_FAILED:", error.message)
    console.error("Inspect evidence:", evidence)
    process.exitCode = 1
  }
})
child.stdin.end(readFileSync(join(root, ".codex/smoke.md"), "utf8"))
