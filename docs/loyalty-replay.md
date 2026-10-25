# Loyalty replay

The implementation adapts the official [Medusa loyalty tutorial](https://docs.medusajs.com/resources/how-to-tutorials/tutorials/loyalty-points/index.html.md) for Medusa 2.21.2 and Nuxt 4.6.2.

## Behavior

- An authenticated EUR customer starts with zero points.
- A fully captured order earns one point per full EUR of discounted product value, including product tax and excluding shipping. Authorization alone earns nothing.
- Redeem whole blocks of 100 points for EUR 10 through native tax-inclusive product adjustments. Shipping is unchanged.
- Applying/removing a promotion does not spend points. Completion uses a database-locked account and unique settlement receipt; failed completion compensates that receipt, and retries cannot debit twice.
- Promotion changes use the native cart lock. Settlement validates the same snapshot used to create the order.
- Nuxt retains completed-cart identity until the received order is acknowledged, allowing recovery after a lost response.
- Cancellation/refund handling is explicitly deferred by the user. Process-crash recovery between separate module operations is not established by compensation tests.

## Isolated environment

The existing `rigby_medusa` database on the project PostgreSQL container at port 5433 was copied, without reset or seed, to `rigby_medusa_replay`.

Verified identities: original OID 16384; replay OID 19769. Original write counters before/after copying: 1038 inserts, 57 updates, 31 deletes. Replay preserved Europe/EUR, enabled `pp_system_default`, four published products, two shipping options and existing customer accounts.

During the final audit the original counters were 1063/66/31, with a separate ordinary `pnpm dev` service on port 9000 and one new original-store order absent from replay. The user confirmed using the original development store during this run. Those records were left untouched. The loyalty fixture accounts, orders and operations below are verified in replay; the original has no loyalty tables.

`apps/backend/scripts/loyalty-replay.cjs` loads normal local configuration internally, validates the local source/replay identities, and supplies replay settings only to its child process. It does not write connection files. Replay JWT/cookie secrets are generated in memory. Use the separate host `127.0.0.1` and ports below; ordinary development launch commands retain their original configuration.

Run from repository root in separate terminals:

```sh
pnpm --dir apps/backend exec node scripts/loyalty-replay.cjs inspect
pnpm --dir apps/backend exec node scripts/loyalty-replay.cjs backend
pnpm --dir apps/backend exec node scripts/loyalty-replay.cjs storefront
```

Build Nuxt first with `pnpm --dir apps/storefront run build`. Replay storefront is `http://127.0.0.1:3100`; Medusa Admin is `http://127.0.0.1:9100/app`.

The inspected loyalty migration creates only the three new loyalty tables and their indexes. It was applied to replay with no pending core migrations and scripts/link/search changes skipped. Do not run migrations against the original database.

## Verification

With both replay services running, the following creates fresh native customer/admin accounts with random credentials held only in memory. It drives real Chrome through Nuxt checkout and the actual Admin capture dialog. It retains real orders, promotions and points in replay; it does not reset or seed anything.

```sh
LOYALTY_FAILURE_TESTS=1 pnpm --dir apps/backend exec node scripts/loyalty-replay.cjs medusa exec ./scripts/loyalty-live.cjs
```

Requires the installed local Google Chrome. The test captures screenshots under `apps/storefront/.cache/loyalty/`. Do not print session tokens, API keys or account passwords to inspect a failure.

The supplementary suite funds its own customers through actual orders and native payment capture. It tests anonymous/foreign access, invalid blocks, insufficient balance, duplicate capture delivery, PostgreSQL transaction rollback, post-debit payment-authorization failure, compensation/retry, stale carts, concurrent spending and promotion/completion races. Only the external System authorization boundary and HTTP response delivery are fault-injected; loyalty behavior and persistence remain real.

The main browser scenario deliberately drops the second successful completion response, reloads the cart and recovers the exact same committed order. A separate Medusa process then checks the persisted final balance.

### Recorded passing run

- Customer: `cus_01M5SS445ZWJCS2VJ9E0T0BYG5`.
- First order: `order_01M5SS49WVS153J35H6PZNPBDP`; EUR 100 eligible products; automatic award of 100 after actual Admin capture.
- Captured payment: `pay_01M5SS49ZQ8FNDJAVZP5RPP829`; browser observed the native Admin capture request returning HTTP 200.
- Second order: `order_01M5SS4KZYVRZX3XCYV5K0CKBM`; EUR 10 native product discount; recovered this same ID after lost response.
- PostgreSQL audit: one applied `earn:<first-order>` entry of +100 and one applied `redeem:cart_01M5SS4FCZN4K0SZRHHCJJBNX6` entry of -100; final balance 0.
- Browser suite: exit 0, 27 assertions. Live PostgreSQL/failure/concurrency suite: exit 0, 114 assertions.
- `pnpm check`: exit 0; 3 unit suites and 44 tests passed, both builds passed. Final backend lint/typecheck/build, formatting check, unit tests and `git diff --check`: exit 0. Frontend lint reports 12 self-closing style warnings; no rules were disabled.
- Both independent reviewers reported no remaining findings after fixes. Their source reviews are separate from the runtime evidence above.

Raw local execution evidence: `apps/backend/.cache/loyalty-e2e.log`, `loyalty-check.log`, `loyalty-backend-build.log`, `loyalty-backend-lint.log`, `loyalty-backend-types.log`, `loyalty-final-format.log`, `loyalty-final-unit.log`. Screenshots are in the storefront cache described above. These ignored files are local evidence, not committed source.

## API and code

- `GET /store/customers/me/loyalty-points` returns `{ points }` for the authenticated customer.
- Authenticated `POST /store/carts/:id/loyalty-points` accepts `{ points: 100 * blocks }`; `DELETE` removes the preview. Both enforce cart ownership and EUR.
- Module: `apps/backend/src/modules/loyalty`.
- Workflows and settlement: `apps/backend/src/workflows/loyalty`, `apps/backend/src/workflows/hooks/loyalty-complete-cart.ts`.
- Automatic capture subscriber: `apps/backend/src/subscribers/loyalty-payment-captured.ts`.
- Nuxt UI: `apps/storefront/app/pages/cart.vue`, `account.vue`; authenticated SDK calls remain in Nitro handlers.

The current deployment uses Medusa's existing local event bus and in-memory cart-lock provider. No durable event delivery or distributed cart-lock guarantee is claimed. Balance transactions use PostgreSQL row locking; multi-process cart completion and process-crash recovery require separate validation before production use.
