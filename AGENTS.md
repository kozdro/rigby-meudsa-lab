# Rigby development harness v2

## Stack and ownership

- Codex is the Orchestrator. Claude Code is a fallback following these same rules.
- Backend: Medusa **2.21.2**, TypeScript, `apps/backend` (`@dtc/backend`).
- Storefront: Nuxt **4.6.2**, Vue 3, TypeScript, `apps/storefront` (`storefront`). Medusa Admin still uses React; the storefront does not.
- Use pnpm **12.11.2** (`packageManager` / `pnpm-lock.yaml`). Verified local Node: **24.22.0**. Respect installed package engines; do not upgrade frameworks during feature work.
- PostgreSQL runs in an existing, separate Docker container. Do not recreate, reset, migrate or seed it as a routine check.

## SPEC -> EXPLORE -> BUILD -> TEST -> REVIEW -> VALIDATE

The main Codex session is Orchestrator, not a separate custom agent. It selects
roles automatically from task scope and risk; users do not select roles or approve
each delegation. Briefly state the chosen scope and why. Use only needed roles.

1. **SPEC:** State observable acceptance criteria, exclusions and the smallest useful change in the conversation. Apply `.agents/skills/brainstorming-lite/SKILL.md` when material ambiguity exists. Resolve technical uncertainty from repository context, Explorer or documentation first. Ask one concrete question only for a missing product/business decision; block dependent implementation until answered. Do not invent business rules.
2. **EXPLORE:** For unfamiliar/cross-app work, delegate a bounded read-only question to the built-in `explorer`: paths, contracts, risks and checks. Skip for understood trivial work. No replacement Explorer role or nested delegation.
3. **BUILD:** Delegate backend to `medusa-specialist`, frontend to `nuxt-specialist` when useful. Small harness/config/documentation changes belong to Orchestrator. Agree on method/path, types, auth, validation, errors and empty states before splitting cross-app work. Assign disjoint file ownership and order dependent work; contract changes return to Orchestrator before dependent edits.
4. **TEST:** Delegate `qa-engineer` for new behavior, failure boundaries, cross-app contracts or material regression risk. Supply ORIGINAL requirements and acceptance criteria before implementation summaries; QA designs tests independently, preferably while BUILD proceeds. It edits ONLY explicitly assigned test files, never production code, manifests or harness. TEST execution follows required implementations. For simple copy/config changes use existing focused checks directly; do not create pointless tests or mandatory QA delegation.
5. **REVIEW:** Select `backend-reviewer` for backend and `frontend-reviewer` for frontend; use both for end-to-end changes. For harness-only changes select a reviewer whose remit includes orchestration checks. Reviewers use separate fresh contexts and inspect original requirements, base revision and actual final diff including untracked files independently, without edits or mutating commands. Send findings to the owning implementer, then request focused re-review after material fixes. QA never replaces independent review.
6. **VALIDATE:** Orchestrator inspects the final tree, runs applicable gates, reconciles review and acceptance criteria, and reports evidence. Agent DONE, reviewer NO_FINDINGS and valid config are not test results. Changes invalidate prior checks for the affected scope.

### Automatic routing

| Scope/risk | Select as needed |
| --- | --- |
| Understood documentation/configuration | Orchestrator; one independent reviewer for substantive harness changes |
| Small frontend copy/layout | nuxt-specialist + frontend-reviewer; skip backend and separate QA unless behavior/risk warrants it |
| Backend business/API behavior | medusa-specialist + qa-engineer + backend-reviewer |
| End-to-end behavior/contract | Explorer, both specialists, qa-engineer, both reviewers; stage work within concurrency limit |
| Unknown technical detail | Explorer / installed source / Context7, rather than a user technical quiz |
| Missing product/business decision | brainstorming-lite + one user question; only independent work may continue |

Only Orchestrator delegates. All children, including Explorer, QA and reviewers,
must not spawn agents. Maximum THREE concurrent subagents across the task, even
when the runtime allows more. Close/stop finished children using supported runtime
controls; if unavailable, report that limitation and await completion before the
next wave. Do not delegate every command or create extra roles. Never run concurrent
edits to the same file. Shared manifests, lockfile and harness belong to Orchestrator
unless explicitly assigned. QA owns assigned tests; implementers must not rewrite
QA assertions to make failures pass. Resolve ownership transfers explicitly.

Every delegation includes: objective, ORIGINAL acceptance criteria, allowed files,
shared contract/dependencies, forbidden actions and required checks. State that
agents share a workspace and must preserve others' edits. Every implementation/QA
return includes: **status** (`DONE`, `BLOCKED`, `NEEDS_DECISION`), **files/symbols**,
**behavior/contract**, **skills/references**, **checks** (command, exit code, counts
or `NOT_RUN` reason), **risks/questions**. Escalate contract changes, unsupported
APIs, ownership conflicts and dependencies before dependent edits. Never silently
widen scope or weaken checks.

Keep raw logs in the executing context; return concise findings and evidence
references. Report unsupported/failed delegation honestly. Never impersonate a
subagent, substitute a generic agent for an unavailable role, or treat a role
prompt/config validity as runtime proof. Fresh CLI evidence does not establish
that an already-open VS Code session has reloaded its role catalog.

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
pnpm harness:smoke             # real autonomous A/B fixture scenarios; .codex/smoke.md
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
- Reviewers never edit or run mutating commands. This is behavioral policy: children inherit the parent sandbox. Prioritize correctness, auth/isolation, SSR, SDK contracts, regressions and test gaps. Findings require severity, location, concrete failure and suggested resolution.
- Final handoff: paths, behavior, delegated roles/evidence, exact checks, NOT_RUN items and readiness limits.
