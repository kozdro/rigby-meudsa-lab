import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { codexRead, root } from "./codex-rpc.mjs"

export const roles = [
  "medusa-specialist", "nuxt-specialist", "backend-reviewer",
  "frontend-reviewer", "qa-engineer",
]

try {
  const { config } = await codexRead("config/read", { cwd: root, includeLayers: false })
  assert.equal(config.features.multi_agent, true, "multi_agent must be enabled")
  assert.equal(config.agents.max_concurrent_threads_per_session, 3)
  assert.equal(config.agents.max_depth, 1)
  assert.ok(!config.agents.reviewer, "Remove the generic reviewer registration")
  assert.ok(!config.agents.explorer, "Explorer must remain built-in")
  for (const role of roles) {
    const registered = config.agents[role]
    assert.ok(registered?.description, `Missing role: ${role}`)
    assert.equal(registered.config_file, join(root, `.codex/agents/${role}.toml`))
    const source = readFileSync(registered.config_file, "utf8")
    assert.match(source, /developer_instructions\s*=\s*"""/)
    assert.doesNotMatch(source, /^\s*(model|model_reasoning_effort)\s*=/m)
    console.log(JSON.stringify({ role, registered: true, model: "inherited" }))
  }
  assert.ok(config.skills?.config.some(s => s.enabled
    && s.path === join(root, ".agents/skills/brainstorming-lite/SKILL.md")),
  "Enable the skill by its SKILL.md path (CLI 0.159.3 does not match directory selectors)")
  const { data } = await codexRead("skills/list", { cwds: [root], forceReload: true })
  const project = data.find(entry => resolve(entry.cwd) === resolve(root))
  assert.ok(project, "Missing project skill discovery")
  assert.equal(project.errors.length, 0, "Skill discovery has errors")
  for (const name of [
    "building-with-medusa", "building-storefronts",
    "storefront-best-practices", "brainstorming-lite",
  ]) {
    assert.ok(project.skills.some(s => s.name === name && s.enabled
      && s.path === join(root, `.agents/skills/${name}/SKILL.md`)), `Missing enabled project skill: ${name}`)
  }
  console.log("HARNESS_CONFIG_OK: 5 custom roles, built-in Explorer, depth 1, limit 3, 4 discovered skills; runtime is checked separately")
} catch (error) {
  console.error("HARNESS_CONFIG_FAILED:", error.message)
  process.exitCode = 1
}
