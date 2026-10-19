# Product Wishlist — 2026-10-19

Base: `e803fb42ac541b1c7ff3869735a76c903447495e`. Changes are committed and pushed.

## Delegation and scope

The actual runtime executed SPEC -> EXPLORE -> BUILD -> REVIEW -> VALIDATE:

| Runtime task | Registered role | Responsibility |
| --- | --- | --- |
| `/root` | Orchestrator | Acceptance criteria, API contract, safe DB preflight/migration, real HTTP/Chrome verification, final gates and documentation |
| `/root/explore` | built-in `explorer` | Read-only repository and installed-version investigation; discovered migration seed default and unsafe disposable DB runner |
| `/root/backend` | `medusa-specialist` | Native module, new migration, links, workflows, Store API, unit tests and live HTTP test implementation |
| `/root/frontend` | `nuxt-specialist` | Native customer login, Nitro BFF, request-scoped SDK, SSR state, catalog buttons and saved-products page |
| `/root/review` | `reviewer` | Independent actual tracked/untracked diff inspection; no edits or DB operations |

Specialists edited disjoint application paths. Orchestrator owned operational
scripts and shared documentation. No nested delegation, role impersonation or
new dependencies. The runtime exposes task paths; no extra thread identifiers
are claimed. Completed specialists/explorer were stopped using available interrupt
controls; no close/delete tool was available.

## Architecture and API

- Native Medusa `wishlist` module: Wishlist owns WishlistItem records. Product
  identity is saved, never variant identity.
- PostgreSQL unique indexes on live `customer_id` and `(wishlist_id, product_id)`.
  Creation of wishlist and first item is transactional; unique races retry after
  rollback. Delete is idempotent and permits adding the same product again.
- Native readOnly Module Links connect wishlist/customer and item/product using
  stored IDs. These links need no additional tables.
- Workflows validate availability and perform mutations. Thin Store routes use
  customer session/bearer authentication and derive ownership from `actor_id`.
- Product details require published status and membership in the publishable
  key's sales channels. Withdrawn items remain removable with `product: null`.
- Nuxt uses a Nitro BFF and per-request SDK with an HttpOnly, SameSite=Lax cookie
  (Secure on HTTPS). JWTs do not enter SSR payloads or browser storage. Mutations
  require matching Origin; logout/login/401 clear customer wishlist state.
- Reads use `useAsyncData` and request-aware fetching. Loading, failure, empty
  data and unavailable products have explicit UI states. UI is in Polish.

All endpoints require a publishable key and authenticated customer:

| Method/path | Input | Success |
| --- | --- | --- |
| `GET /store/wishlist` | No owner parameter | `200 { wishlist: null }` before first add; otherwise own list |
| `POST /store/wishlist/items` | Strict `{ product_id: string }` | `200`, whole refreshed list; repeated adds succeed |
| `DELETE /store/wishlist/items/:product_id` | Product ID in path | `200`, whole refreshed envelope; repeated deletes succeed |

List shape: `{ wishlist: { id, items: [{ id, product_id, product: { id, title,
handle, thumbnail } | null }] } | null }`. Anonymous requests return 401; invalid
body 400; unknown/unavailable product on add 404. No sharing or public wishlist ID
route. Initial GET performs no writes.

## Database safety

Normal Medusa configuration loading plus a read-only PostgreSQL transaction
confirmed the connection target `localhost:5433/rigby_medusa` and the actual
`current_database()` before generation/application. Docker mapping was also
verified. No manual `.env` reads or credential output.

Installed core migration names were compared with `mikro_orm_migrations`: no
pending core migrations. Generated `Migration20261019130939` was inspected before
application; its forward operations concern only new wishlist tables/indexes/FK.

Executed, exit 0:

```sh
pnpm --dir apps/backend exec node scripts/wishlist-db.cjs
pnpm --dir apps/backend exec medusa db:generate wishlist
pnpm --dir apps/backend exec medusa db:migrate --skip-scripts --skip-search --skip-links
```

`--skip-scripts` is essential: this repo contains an initial-data migration script
that seeds data. `--skip-links` is valid because the new links are readOnly. No
reset, seed, database creation/drop or existing migration rewrite was performed.
Post-migration preflight confirmed both unique indexes in PostgreSQL.

## Executed validation

| Command/exercise | Result |
| --- | --- |
| `pnpm harness:check` | Exit 0; all three custom roles registered, inherited model |
| `pnpm check` | Exit 0: both lints, Nuxt typecheck, unit tests and both builds |
| Backend unit tests within check | 2 suites, 19/19 passing: 13 wishlist and 6 preserved search tests |
| `pnpm --dir apps/backend exec medusa exec ./scripts/wishlist-live.cjs` | Exit 0; real local Medusa/PostgreSQL and production Nuxt, no mocked network |
| Live Store API | 28 assertions: native registration/login, initial list, add/delete/re-add, eight concurrent first adds, anonymous methods, invalid inputs, owner spoofing, two-client isolation and fresh-login retrieval |
| Native module/database invariants | Two rejected duplicate writes, two Module Link checks, failed item write plus absence of orphan wishlist |
| Independent Medusa process on 9001 | Four checks; same saved ID/product read from a newly started process using PostgreSQL |
| Live Nitro security | 10 assertions: anonymous methods, cross-origin mutations, invalid JWT session clearing |
| Headless local Chrome | 13 UI assertions: login, list removal, catalog add, reload, logout/account switch, isolation, HttpOnly cookie, SSR HTML and no serialized JWT; no uncaught exceptions/console errors |

Raw local evidence (ignored, may be regenerated):

- `apps/backend/.cache/wishlist-check.log`
- `apps/backend/.cache/wishlist-migration.log`
- `apps/backend/.cache/wishlist-live.log`
- `apps/backend/.cache/wishlist-second-server.log`
- `apps/backend/.cache/wishlist-nuxt.log`
- `apps/storefront/.cache/wishlist-browser.png`

The live script creates two unique test customer accounts and leaves their saved
items for persistence evidence. Credentials exist only in process memory and are
not printed or saved. It uses an existing published product and publishable key;
it does not seed/change the catalog. It starts/stops its extra Medusa process and
Nuxt/Chrome. Ports 3000 and 9001 must be free. Main Medusa on 9000 must be running,
and storefront build must exist. Local Google Chrome at its standard macOS path
is required for the browser part.

## Review, fixes and limits

Independent review of backend/frontend source and focused final review of scripts
and documentation returned NO_FINDINGS. The reviewer checked actual files,
installed transaction/auth/SDK behavior and recorded gate/live evidence. A P3
finding identified a screenshot path relative to the caller's directory. It was
fixed by anchoring the path to `import.meta.url`; the full live exercise passed
again and regenerated the screenshot at the documented location.

Real startup exposed a pre-existing issue: the search loader imported
`src/search/helpers/__tests__/option-values.unit.spec.ts`, causing `describe is not
defined`. The six tests moved to `src/__tests__/search/option-values.unit.spec.ts`
with a corrected import; the harness smoke instruction now references that path.
The new workflow test directory is excluded by Medusa's WorkflowLoader.

Initial test-import and CJS runner-export/readiness issues were corrected; final
checks and live validation passed. Installed SDK bundler warnings remain during
Nuxt build and do not prevent the verified runtime.

Final operational JS syntax checks (`node --check` for all three scripts) and
`git diff --check` passed, exit 0.

NOT_RUN: destructive standard HTTP/module integration runners (no disposable DB
authorized), and the separate bounded `pnpm harness:smoke` task (real feature
delegation was exercised directly). Live catalog withdrawal/draft/cross-channel
fixtures were not created; filtering behavior has unit coverage and source review.
The durability check used a fresh independent Medusa process; no PostgreSQL
container restart, deployment or production-scale test was performed. Native
email/password login supports existing customer accounts; registration UI and
extra verification flows are outside MVP. Separate browser tabs do not synchronize
session state automatically.

## Demonstration

1. Migration above is already applied to the verified local Rigby DB. For another
   environment, review its target and migration plan before applying anything.
2. Run `pnpm dev` with the normal local configuration. Nuxt public backend URL and
   publishable key use the existing runtimeConfig variable names; match CORS to
   the actual origins. No credentials belong in source or this document.
3. Open `http://localhost:3000/login` and log in to an existing native Medusa
   customer account.
4. On `/`, choose "Dodaj do ulubionych". Open `/wishlist`, reload, then remove the
   product. Repeat add/remove; log out and switch customers to verify isolation.
5. For the automated demonstration, build first with `pnpm build`, run only
   `pnpm backend:dev`, keep 3000/9001 free, then execute:

```sh
pnpm --dir apps/backend exec medusa exec ./scripts/wishlist-live.cjs
```

This generates fresh native test accounts in memory and reports only assertion
counts. The final screenshot is saved at the ignored path listed above.
