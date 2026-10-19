# Rigby Medusa lab

Local pnpm monorepo for a one-hour live task: Medusa 2.21.2 backend and a minimal
Nuxt 4 / Vue 3 / TypeScript storefront. Codex orchestrates development; Claude Code
is a fallback. This repository does not include a complete checkout or wishlist.

Use pnpm 12.11.2. The validated shell uses Node 24.22.0; pnpm may select another
installed compatible Node for child processes, so record both when diagnosing
tooling. PostgreSQL and development services are already provisioned locally.

```sh
pnpm install --frozen-lockfile
pnpm dev
# or pnpm backend:dev / pnpm storefront:dev
```

Backend normally uses http://localhost:9000 (Admin: /app); Nuxt normally uses
http://localhost:3000. Actual ports may differ. Match browser origins to backend
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

Codex loads [AGENTS.md](./AGENTS.md) and the three existing skills in
`.agents/skills/`. Project config registers `medusa-specialist`, `nuxt-specialist`
and `reviewer`; exploration uses Codex's built-in `explorer`. Models are inherited.
Project configuration must be trusted by the local Codex client.
Start a fresh Codex session after changing role definitions or project configuration.

```sh
pnpm harness:check  # inspect effective config through the installed Codex app server
pnpm harness:smoke  # real Codex calls and bounded edits; uses normal Codex usage
```

The repeatable [smoke task](./.codex/smoke.md) adds/verifies pure option-helper
tests and the Nuxt successful-empty catalog state. It uses
SPEC -> EXPLORE -> BUILD -> REVIEW -> VALIDATE and preserves already-correct
implementations on subsequent runs. It never resets/seeds the DB or implements
wishlist. Evidence is written to a temporary directory printed by the command.
A successful Codex process exit alone does not prove delegation or passing QA.

Use an ordinary persisted Codex session for this workflow: CLI 0.159.3 failed to
fork Explorer context in `--ephemeral` mode. Reviewer is forbidden to edit by
policy; subagents still inherit the parent permission sandbox. See AGENTS.md for
delegation contracts, skill overrides, escalation and quality gates.
