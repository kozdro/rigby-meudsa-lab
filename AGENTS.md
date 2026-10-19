# Rigby development harness

## Stack and ownership

- Codex is the Orchestrator. Claude Code is a fallback following these same rules.
- Backend: Medusa **2.21.2**, TypeScript, `apps/backend` (`@dtc/backend`).
- Storefront: Nuxt **4.6.2**, Vue 3, TypeScript, `apps/storefront` (`storefront`). Medusa Admin still uses React; the storefront does not.
- Use pnpm **12.11.2** (`packageManager` / `pnpm-lock.yaml`). Verified local Node: **24.22.0**. Respect installed package engines; do not upgrade frameworks during feature work.
- PostgreSQL runs in an existing, separate Docker container. Do not recreate, reset, migrate or seed it as a routine check.

## SPEC -> EXPLORE -> BUILD -> REVIEW -> VALIDATE

1. **SPEC:** Orchestrator states observable acceptance criteria, exclusions and the smallest useful change. Keep the plan in the conversation.
2. **EXPLORE:** For unfamiliar/cross-app work, delegate a bounded question to the built-in `explorer`. It reads relevant files and returns paths, existing contracts, risks and checks. No edits or nested delegation. Skip for an understood trivial change.
3. **BUILD:** Delegate backend implementation to `medusa-specialist` and frontend implementation to `nuxt-specialist` when useful. Do small configuration/documentation work directly. Agree on method/path, types, auth, errors and empty states before splitting cross-app work. Parallelize only disjoint files with an agreed contract.
4. **REVIEW:** Ask `reviewer` in a separate context to inspect requirements and the actual final diff, including untracked files. Supply base revision and changed paths. It investigates independently; an implementer's summary is not proof. Send findings to the responsible implementer; request focused re-review after material fixes.
5. **VALIDATE:** Orchestrator checks the final tree, runs applicable gates, reconciles review and acceptance criteria and reports evidence. A reviewer verdict is not a test result. Changes after a check invalidate that check for the affected scope.

Only Orchestrator delegates. Specialists/reviewer must not spawn agents. Maximum three concurrently running subagent threads; stop finished threads using available runtime controls (some clients have no close/delete tool). Do not delegate every command or create extra roles. Never run concurrent edits to the same file. Shared manifests, lockfile and harness belong to Orchestrator unless explicitly assigned.

Every delegation includes: objective, acceptance criteria, allowed files, shared contract, forbidden actions and required checks. Every implementation return includes: **status** (`DONE`, `BLOCKED`, `NEEDS_DECISION`), **files/symbols**, **behavior/contract**, **skills/references**, **checks** (command, exit code, counts or `NOT_RUN` reason), **risks/questions**. Escalate contract changes, unsupported APIs, ownership conflicts and dependencies before dependent edits. Never silently widen scope or weaken checks.

Keep raw logs in the executing context; return concise findings and evidence references. Report unsupported/failed delegation honestly. Never impersonate a subagent or treat a role prompt as runtime execution.

## Medusa rules and skills

- Read `.agents/skills/building-with-medusa/SKILL.md`, then relevant `reference/` files (API, workflows, modules, links, queries, auth).
- File-based handlers live in `src/api/**/route.ts`. Keep routes thin. Mutations/business processes use workflows/steps; simple reads may use Query directly. Use module services/links, not raw SQL or direct DB clients.
- Reuse core workflows. Validate input and ownership/authentication. Generate a **new** migration for model changes; never rewrite existing migrations or apply them to the running database without task authorization.
- Use `@medusajs/framework/zod`, installed types and recommended `@medusajs/eslint-plugin` rules. Never disable Medusa rules or bypass lint for a green build.
- Project compatibility overrides skill examples: Medusa 2.21.2 supports PUT/PATCH too. Do not invent framework restrictions from examples.
- Prices are display amounts; do not divide/multiply by 100.

## Nuxt rules and storefront skills

- Read `building-storefronts/SKILL.md` and its SDK reference for integration. For UI, read `storefront-best-practices/SKILL.md` and relevant references only. Preserve the three installed skills.
- **Project overrides:** no Next.js routes/Server Actions, React hooks/React Query, `NEXT_PUBLIC_*` or React dependencies in the storefront. Translate examples into Vue SFCs, Composition API and Nuxt 4.
- Use `app/pages`, `app/components`, `app/plugins`, `app/composables`; Nitro handlers live under `server/`. Reuse `app/plugins/medusa.ts`, not a global authenticated singleton.
- Wrap SDK reads in `useAsyncData`; use `useFetch` for suitable Nuxt HTTP endpoints. Mutations belong in explicit actions with pending/error handling and refresh/invalidation. Preserve SSR/hydration; no mutation side effects in async-data handlers.
- Use runtimeConfig. Public overrides: `NUXT_PUBLIC_MEDUSA_BACKEND_URL`, `NUXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`. Never expose backend credentials/admin tokens.
- Prefer built-in SDK methods; custom Medusa routes use `sdk.client.fetch` with object bodies. Preserve required headers. The skill's blanket fetch ban does not prohibit Nuxt HTTP tooling.
- Use regional context when displaying prices. Handle loading/errors/empty data. Port 8000 is not required: actual origins must match CORS. Configure Vite through Nuxt only for a demonstrated issue.

## Documentation

For unfamiliar/version-sensitive APIs use Context7: resolve-library-id, then a focused query-docs. Verify against installed Medusa 2.21.2 types/source. Medusa Docs MCP is optional and may require Cloud authentication; use public official docs/Context7 when unavailable. Do not install plugins or add credentials just to finish a task.

## Commands and quality gates

Run from root with pnpm; never introduce another lockfile:

```sh
pnpm dev                       # both apps
pnpm backend:dev               # normally localhost:9000; /app admin
pnpm storefront:dev            # Nuxt normally localhost:3000; actual port may differ
pnpm lint                      # both apps, no cache
pnpm typecheck                 # Vue/TypeScript
pnpm test                      # backend unit tests, no DB
pnpm build                     # both apps
pnpm check                     # lint + typecheck + unit tests + build
pnpm harness:check             # effective role config through local Codex app server
pnpm harness:smoke             # real bounded multi-agent exercise; .codex/smoke.md
pnpm --dir apps/backend run test:integration:http
pnpm --dir apps/backend run test:integration:modules
```

- Backend: Medusa lint/build and relevant behavior tests. Frontend: lint/typecheck/build and changed-behavior smoke. Documentation-only changes need relevant config/link checks.
- Add meaningful behavior/failure-boundary tests, not tests mirroring configuration. No `--passWithNoTests`, disabled rules or mocked success evidence.
- Integration suites may create/drop databases: require an identified disposable test DB and explicit task authorization. Never use the running development DB. Report `NOT_RUN` if absent.
- Report commands, exit codes, counts, failures and limitations. Tool startup, valid config and agent `DONE` do not establish passing gates.

## Boundaries and review policy

- Stay in this repository. Do not access Bluvv Advisor or unrelated workspaces.
- Do not read/modify/print/copy `.env*` or secrets. Document variable names without values. Build tools may load normal local configuration, but must not dump it.
- No DB reset/seed, wishlist implementation, commit, push or deployment unless requested. Remove a broken seed alias instead of invoking it to test it.
- Preserve unrelated work. Only pnpm may change `pnpm-lock.yaml`; add dependencies inside the owning app. Shared tooling is Orchestrator-owned unless delegated.
- Generated `.medusa`, `.nuxt`, `.output`, `.nitro`, `dist`, `.turbo` are not source. Do not edit them; prepare/build may regenerate them.
- Follow surrounding style: TypeScript, 2 spaces, no new semicolons. No cosmetic rewrites, emojis or unrelated refactors.
- Reviewer never edits or runs mutating commands. This is behavioral policy: children inherit the parent sandbox. Prioritize correctness, auth/isolation, SSR, SDK contracts, regressions and test gaps. Findings require severity, location, concrete failure and suggested resolution.
- Final handoff: paths, behavior, delegated roles/evidence, exact checks, NOT_RUN items and readiness limits.
