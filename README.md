# Rigby Medusa lab

Local pnpm monorepo for a one-hour live task: Medusa 2.21.2 backend and a minimal
Nuxt 4 / Vue 3 / TypeScript storefront. Codex orchestrates development; Claude Code
is a fallback. Product Wishlist is implemented end to end; checkout remains out
of scope. See [wishlist implementation and verification](./.codex/wishlist-verification.md)
for API contracts, safe migration commands, live checks and demonstration steps.

Use pnpm 12.11.2. The validated shell uses Node 24.22.0; pnpm may select another
installed compatible Node for child processes, so record both when diagnosing
tooling. PostgreSQL and development services are already provisioned locally.

```sh
pnpm install --frozen-lockfile
pnpm dev
# or pnpm backend:dev / pnpm storefront:dev
```

Backend normally uses <http://localhost:9000> (Admin: /app); Nuxt normally uses
<http://localhost:3000>. Actual ports may differ. Match browser origins to backend
CORS. Configure public SDK options using NUXT_PUBLIC_MEDUSA_BACKEND_URL and
NUXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY through Nuxt runtimeConfig. Never expose admin
credentials. Do not copy credentials into instructions, logs or source.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
pnpm start  # builds first, then starts both production applications
```

Unit tests are database-free. HTTP/module integration suites remain separate:
they may create/drop test databases and must only use an explicitly authorized,
disposable test database. Do not run them against the existing development DB.
There is intentionally no automatic seed/reset command.

Codex uses [Harness v2](./AGENTS.md):
SPEC -> EXPLORE -> BUILD -> TEST -> REVIEW -> VALIDATE.
The main session automatically selects roles by scope and risk; users do not
choose agents or approve each delegation. Explorer is built-in. Custom roles:
`medusa-specialist`, `nuxt-specialist`, `qa-engineer`, `backend-reviewer` and
`frontend-reviewer`. Models are inherited. Maximum three concurrent children,
without nested delegation. QA owns assigned tests and designs them from original
requirements; reviewers independently inspect the actual diff without edits.

The three existing Medusa/storefront skills are preserved. The local
[brainstorming-lite](./.agents/skills/brainstorming-lite/SKILL.md) resolves material
ambiguity: repository/Explorer/docs first for technical unknowns, one concrete user
question for an unresolved business decision, and dependent implementation waits.
Clear tasks need no extra question or design document. The skill is automatically
discovered and explicitly enabled in project config; skills-lock.json continues
to describe only the three upstream skills, not this local authored skill.

Project config must be trusted by the local client. Start a fresh VS Code Codex
session after role/skill changes; an already-open session may retain the old catalog.

```sh
pnpm harness:check  # effective role/depth/concurrency config + four discovered skills
pnpm harness:smoke  # actual fresh CLI sessions, autonomous A/B routing + fixture assertions
pnpm harness:smoke -- A
pnpm harness:smoke -- B
```

See the [smoke protocol](./.codex/smoke.md) for safe test-only tasks and interactive
scenario C. A/B use ignored fixture files under `.harness-runs/`, real local
HTTP and installed Vue SSR, with no production app edits or database access. B enables network access for its
single CLI invocation so the sandbox can bind loopback; global/project defaults stay unchanged.
Evidence paths are printed by the command. A passing config or process exit is
insufficient: the runner requires typed child threads and independently executed
assertions. Trace review covers ownership, scheduling and review conclusions.
This does not establish live Medusa/Nuxt/browser behavior or current VS Code routing.

Use persisted CLI sessions: local CLI 0.159.3 previously failed to fork Explorer in
`--ephemeral` mode. Read-only reviewer and test-only QA ownership are behavioral
policies within inherited permissions, not separate security sandboxes.
See [v2 verification](./.codex/verification-v2.md) for actual results and limits;
[verification.md](./.codex/verification.md) is the historical v1 report.
