import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { codexRead, root } from "./codex-rpc.mjs"

try {
  const { config } = await codexRead("config/read", { cwd: root, includeLayers: false })
  assert.equal(config.features.multi_agent, true, "multi_agent must be enabled")
  assert.equal(config.agents.max_concurrent_threads_per_session, 3)
  for (const role of ["medusa-specialist", "nuxt-specialist", "reviewer"]) {
    const registered = config.agents[role]
    assert.ok(registered?.description, `Missing role: ${role}`)
    assert.equal(registered.config_file, root + `.codex/agents/${role}.toml`)
    const source = readFileSync(registered.config_file, "utf8")
    assert.match(source, /developer_instructions\s*=\s*"""/)
    assert.doesNotMatch(source, /^\s*(model|model_reasoning_effort)\s*=/m)
    console.log(JSON.stringify({ role, registered: true, model: "inherited" }))
  }
  console.log("HARNESS_CONFIG_OK: effective config/read; delegation is checked separately")
} catch (error) {
  console.error("HARNESS_CONFIG_FAILED:", error.message)
  process.exitCode = 1
}
