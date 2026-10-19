# Harness v2 verification — 2026-10-19

Base revision: `fc6605750d4860f5017c4ed3f0622ed564651777`.
No commit or push. Medusa 2.21.2 / Nuxt 4.6.2 / pnpm 12.11.2 unchanged.

## Architecture and routing

The current Codex session is Orchestrator. Explorer remains built-in. The five
custom roles are medusa-specialist, nuxt-specialist, qa-engineer,
backend-reviewer and frontend-reviewer. The generic reviewer registration is removed.
Routing is a scope/risk decision made by Orchestrator from AGENTS.md; it is not a
hard-coded scheduler or a user role menu. The smoke verifier checks separate expected
role sets, without giving those role lists to the scenario prompt.
Maximum three concurrent children, max_depth=1, no nested delegation. Models inherit
from the session. QA receives original requirements before implementation summaries
and owns only assigned tests. Reviewers receive original requirements and actual
source/diff, including fixture files hidden from git diff, and cannot edit.

## Brainstorming lite and sources

The local `.agents/skills/brainstorming-lite/SKILL.md` builds on the original
[Superpowers Brainstorming](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md),
read on 2026-10-19. It adopts context-first intent clarification, focused questions
and proportional scope, without copying the full workflow, mandatory artifacts,
commits or full-design approval gates. Business decisions remain with the user;
technical uncertainty goes first to Explorer/source/Context7. Simple clear tasks
proceed without added questions/documents. One needed product question blocks only
dependent implementation; elapsed time/preselected options do not count as answers.

Reference checks used Context7 `/openai/codex`, effective local config/read and
skills/list, plus official [subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents)
and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
Installed runtime behavior takes precedence over assuming current docs match CLI.
A no-write app-server override probe found that CLI 0.159.3 ignores a directory
selector for per-skill enablement: directory + enabled=false left the skill enabled,
whereas SKILL.md + enabled=false disabled it. Corrected the project override to the
SKILL.md file and added an effective-config assertion; discovery alone would miss
an ineffective override because repository skills are enabled by default. The
probe used only CLI -c overrides, without modifying user/global configuration.

## Actual scenarios

Initial A attempt, parent `01a155af-82d4-7ae2-a18f-4593690f90b2`, selected only
nuxt-specialist and frontend-reviewer (review planned). The implementation child
`01a155af-e6d5-78f2-bbbf-352a66a69eb2` was genuinely started but BLOCKED: workspace-write
protects `.codex/`, including the original fixture path. No implementation or review
was completed. Runner exited 1, not a successful smoke. Evidence:
`.codex/.smoke-runs/1792438927986-7635/A/`.

Corrected fixture location: ignored `.harness-runs/` in this repository; sandbox
permissions remain workspace-write. No permission weakening or product-code edits.
A final parent: `01a155b2-fb93-7942-9a41-eb83212d9964`.
- nuxt-specialist `01a155b3-74f4-70b0-ae75-c48abd06a1e4`: DONE, only A/frontend.mjs.
- frontend-reviewer `01a155b4-1fcb-71b0-a5b4-aaaa12d7ec69`: NO_FINDINGS.
- Independent fixed check: exit 0, 1/1 actual Vue SSR assertion; maximum concurrent
  children 1; no nested delegation; source/config/lockfile fingerprint unchanged.
- Trace audit (`A/audit-input.json`) confirms only the owned file was patched,
  reviewer used read-only inspection/diff/hashes, and review followed a passing test.
- Evidence: `.harness-runs/1792439155314-9730/A/`.

The prior A retry (`.harness-runs/1792439036455-8832/A/`) genuinely passed its
implementation/review/test, but the runner exited 1 because Node's default text
reporter did not match TAP counters. Fixed by explicitly selecting
`--test-reporter=tap`; the final A above validates this correction.

First B parent: `01a155b4-871c-7992-b6c4-76a7756574ec`, all six typed roles completed,
max concurrency 3, both reviews NO_FINDINGS. QA designed tests before implementation,
but sandboxed QA execution hit `listen EPERM` on 127.0.0.1; those assertions were
NOT verified inside QA. The outer runner independently executed them successfully:
38/38, exit 0; app source fingerprint unchanged. Thus the default A+B smoke command
exited 0, while the child-network limitation remained explicitly reported. Evidence:
`.harness-runs/1792439155314-9730/B/`.

For final B, only its CLI invocation now enables
`sandbox_workspace_write.network_access=true` (not project/global defaults).
This permits network generally for that invocation, not a loopback-only firewall;
tests are constrained to ephemeral 127.0.0.1 listeners. The documented pnpm `-- B`
selector also needed normalization because pnpm 12 preserves the separator; the
initial selector attempt exited 1 before any agent started and was corrected.
Final B (network enabled for this CLI invocation): PASS.
Parent `01a155b7-e39d-76b0-9f71-be241cc15b02`.

| Actual loaded role | Actual child thread ID | Result |
| --- | --- | --- |
| explorer | 01a155b8-1ac9-7a50-921f-b9499388841d | completed, read-only contract map |
| qa-engineer | 01a155b8-38f4-76c0-b2c4-40813b068fed | original-requirements design before BUILD; 34/34 tests exit 0 |
| medusa-specialist | 01a155b8-8cc4-7931-80c4-a86502a04a93 | DONE, only backend.mjs |
| nuxt-specialist | 01a155b8-ab6e-7bc2-b29f-3ce0cdfa9d52 | DONE, only frontend.mjs |
| backend-reviewer | 01a155b9-3646-74b1-aa95-990c29584cae | NO_FINDINGS, read-only |
| frontend-reviewer | 01a155b9-5278-7531-a18e-c4990e9f724a | NO_FINDINGS, read-only |

The fixed acceptance suite passed 3/3; the independent outer runner repeated both
suites: 37/37, exit 0. Maximum concurrent child turns: 3; no nested delegation;
application source/config and shared manifest/lockfile fingerprint unchanged. Timings are app-server seconds
resolution, reinforced by the runtime limit of 3.

Final B trace audit (`B/audit-input.json`): Explorer/reviewers patched nothing;
specialists patched their own implementation only; QA patched its assigned test
only and read runtime/original context before source existed. QA's test run followed
both implementation completions, and both reviews followed passing TEST. Reviewer
commands were source/diff/hash/evidence reads, without tests/builds or mutations.
QA covers normalization, unsupported methods/routes, genuine HTTP-to-SSR, fallback,
escaping and upstream 4xx/5xx; no mocked positive integration. Evidence directory:
`.harness-runs/1792439476850-12234/B/`.

Independent harness review: NO_FINDINGS. Fresh CLI parent
`01a155ba-f15d-7900-a128-89682b3703be`, actual backend-reviewer child
`01a155bb-5d36-7220-b1cc-d95ef9e4aaaf`, fork_turns=none. It independently inspected
the base diff, all assigned untracked source, actual A/B fixture code and raw
parent/child rollouts, test logs, source ownership and sequencing. No edits or
mutating commands; all inspection commands exit 0. Evidence:
`.harness-runs/final-review/{events.jsonl,summary.json}`.

That full review preceded the skill-selector correction. Focused independent
re-review of final config, checker, skill and verification claims also returned
NO_FINDINGS: fresh CLI parent `01a155bd-97f4-7f53-8226-28a1efd6e3b3`, actual
backend-reviewer child `01a155bd-ce92-7402-8d8e-bb87ce42da54`, fork_turns=none.
It read the final SKILL.md selector and exact effective-config assertion, actual
diff/untracked source, with inspection exit 0 and no mutations. Evidence:
`.harness-runs/focused-review/{events.jsonl,summary.json}`. The root obtained child
UUIDs through app-server RPC; the subagent's prose exposed only its task path.

Reviewers did not rerun execution gates. The root's post-correction harness:check
passed; script syntax and whitespace checks also passed. Application checks remain
applicable because application source is unchanged. After the runtime exercises,
smoke source received only semicolon-to-newline formatting (no assertion/behavior
changes); final syntax checks cover that formatting. The focused reviewer did not
independently rerun the no-write selector probe; the root performed it.
C's original chat exchange was available to root; the independent reviewer could
inspect only its explicit local transcription, not the original interactive UI.

C: actual interactive test in this chat, using brainstorming-lite, no code changes.
Ambiguous fixture request: "Pokaż klientowi informację o dostępności produktu".
Actual question: "co ma oznaczać informacja o dostępności produktu?" with alternatives
availability yes/no, exact stock count, or expected shipping time and their tradeoffs.
The question explicitly stated that dependent implementation waits. The user
answered: "Tylko dostępny / niedostępny — prosty komunikat bez ujawniania zapasu".
Orchestrator acknowledged this acceptance rule (no quantity or shipping estimate).
No business default was invented and no dependent code was written before the answer.
C remains conversation-only after the answer, as requested; no product implementation
was authorized by this fixture exercise. A/B harness work continued independently.
Result: PASS for the actual question, dependency hold, answer and criteria update.

## Quality gates

- `pnpm harness:check`: exit 0; five custom roles, built-in Explorer, depth 1,
  concurrency limit 3, four enabled repository skills from effective app-server RPC.
- `pnpm check`: exit 0; both app lints, Nuxt typecheck, 2 unit suites / 19 tests,
  backend build including Admin and Nuxt build. Raw log:
  `.codex/.smoke-runs/1792438927986-7635/project-check.log`.
- Skill creator `quick_validate.py`: NOT_RUN successfully; startup exit 1 because
  PyYAML is unavailable. Alternative installed ESLint js-yaml parser validated
  frontmatter/name/description (exit 0); actual Codex skills/list discovered the skill
  enabled without discovery errors. No dependency installation was needed.
- `node --check scripts/check-harness.mjs`, `node --check scripts/codex-rpc.mjs`,
  `node --check scripts/smoke-harness.mjs`, `git diff --check`: exit 0.
- Local Markdown link check: exit 0, 6 valid local targets.
- `pnpm harness:smoke`: exit 0 for actual A/B, with first B's sandboxed test limitation
  above; `pnpm harness:smoke -- B`: exit 0 for the final network-enabled B, including
  successful delegated QA execution and independent assertions.
- HTTP/module DB integration and browser/live service checks: NOT_RUN; harness-only
  changes, no disposable DB identified/authorized. A/B are synthetic fixtures.

## Runtime limits

Fresh CLI/app-server 0.159.3 loads the v2 role catalog. The already-open current
session exposes medusa-specialist, nuxt-specialist and legacy reviewer. An ACTUAL
`collaboration.spawn_agent` request for `backend-reviewer` (task
`vscode_v2_role_probe`, fresh context, read-only config inspection) returned
`unknown agent_type 'backend-reviewer'`; no child was created and no fallback or
role-play was used. Thus v2 domain-review routing is unavailable in this current
session, despite effective config visibility in fresh app-server/CLI processes. Built-in
Explorer actually ran here as `/root/explore_harness` and returned bounded read-only
harness findings. Autonomous v2 routing in a fresh VS Code session is NOT_VERIFIED;
CLI success must not be presented as IDE-specific proof. Reload/start a fresh VS Code
Codex session and run a requirement-only A/B prompt to complete that client check.

Persisted CLI contexts are used; earlier --ephemeral fork failures are documented
in v1 verification. No close/delete tool is exposed in this current collaboration
API; completion/available interrupts are distinct from deleting threads. Review
read-only rules and QA file ownership are behavioral policy under inherited sandbox
permissions, not independent filesystem security boundaries.

The existing global config warning about `mcp_servers.context7.type` remains; global
config and credentials were not read/edited. No manual .env/secret access, DB actions,
wishlist business changes, framework upgrades, commits, pushes or deployment.

## Changed files

- `AGENTS.md`: workflow, autonomous scope/risk routing, ownership/dependencies, QA/review policy.
- `.codex/config.toml`: five custom roles, preserved limits/models, local skill enablement.
- `.codex/agents/medusa-specialist.toml`, `.codex/agents/nuxt-specialist.toml`: shared-workspace and QA ownership rules.
- `.codex/agents/backend-reviewer.toml`, `.codex/agents/frontend-reviewer.toml`: independent domain review.
- `.codex/agents/qa-engineer.toml`: requirements-first QA, test-only ownership.
- `.codex/agents/reviewer.toml`: deleted generic role definition.
- `.agents/skills/brainstorming-lite/SKILL.md`: authored local skill and original-source attribution.
- `scripts/check-harness.mjs`: effective role/limits and actual skill discovery checks.
- `scripts/smoke-harness.mjs`: requirement-only A/B prompts, isolated fixtures, actual typed-thread verification, fixed independent checks and failure reporting.
- `scripts/codex-rpc.mjs`: client version v2; preserved bounded read-only RPC helper.
- `.codex/smoke.md`: repeatable A/B, interactive C, evidence and client boundaries.
- `.codex/verification-v2.md`, `README.md`: instructions, results and limitations.
- `.gitignore`: ignore owned fixture/evidence runs, including blocked initial path.

No app source, manifests, lockfile, upstream skills/skills-lock, .env, DB or secrets
were modified by this task. Historical v1 report remains unchanged.
