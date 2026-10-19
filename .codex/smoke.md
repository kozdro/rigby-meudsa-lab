Run the real SPEC -> EXPLORE -> BUILD -> REVIEW -> VALIDATE workflow in this repository.
This is an authorized, bounded and repeatable smoke task: handle empty catalog data.
Use actual configured agent_type values, not role-play. If a named type or built-in
explorer is unavailable, stop and report UNSUPPORTED with the actual error.
Do not fall back to a generic agent pretending to be a specialist. No fixed models.

SPEC:
- Pure backend option normalization returns [] for absent/empty input, ignores blank
  titles/values, trims values and deduplicates repeated option values.
- Nuxt product listing shows a Polish empty-state message when a successful result
  has no products; pending and error states still take precedence.
- Preserve SDK/useAsyncData, SSR and the existing product list.
- No wishlist, backend API change, .env/secret reads, unrelated workspaces, DB
  reset/seed/migrations, integration tests, commit/push, package installs or edits
  to shared manifests/harness. Build tools may load normal env but never dump it.

EXPLORE:
Spawn the BUILT-IN explorer for a read-only map of the two affected paths and
existing contracts/checks. Ask it to identify itself and its separate thread ID.
Wait for its result and stop it with available controls before BUILD. Report an
absent close/delete tool rather than claiming deletion.

BUILD:
Spawn medusa-specialist and nuxt-specialist with their actual configured agent types.
Their file ownership is disjoint; they may execute concurrently.
- medusa-specialist may create/update only
  apps/backend/src/__tests__/search/option-values.unit.spec.ts.
  Read the backend skill and relevant references. Add meaningful pure Jest tests
  for the acceptance criteria against the existing helper. Do not rewrite the helper.
  Run pnpm --dir apps/backend run test:unit and report actual counts/exit code.
- nuxt-specialist may create/update only apps/storefront/app/pages/index.vue.
  Read storefront skills/relevant references and apply Nuxt overrides.
  Implement only the successful-empty state. If it already exists, inspect it and
  leave it unchanged. Run storefront lint/typecheck; report exact commands/results.
Give each agent all criteria, allowed files and exclusions. No child may delegate.
If either needs other files, return NEEDS_DECISION to Orchestrator, do not widen scope.
Both must return skills/references used, paths and exact check evidence. Wait and
stop both using available controls. An agent saying DONE is not proof: inspect changes.

REVIEW:
Spawn reviewer in a fresh context after BUILD. Supply the original SPEC, base HEAD,
the TWO allowed task paths and actual diff/untracked paths. It must independently
read the changed files and actual diff, not just implementation summaries. No edits,
test/build commands, DB calls or nested delegation. Ask for concrete findings with
locations, evidence inspected, skill references and QA limitations.
If it requests fixes, delegate them back to the responsible specialist and perform
focused re-review. Stop/report if resolution needs out-of-scope edits.

VALIDATE:
Inspect final diff. Run pnpm test, pnpm --dir apps/storefront run lint and
pnpm --dir apps/storefront run typecheck. Builds and full harness review belong to
the parent session in this initial run; report those as NOT_RUN here.
Do not claim a browser or empty-data rendering test ran unless actually performed.
Return each real child thread ID/type, delegation outcomes, skill references,
changed paths, commands/exit codes/counts, review findings and remaining limits.
A repeat run should preserve already-correct behavior and tests. Report no-op honestly.
