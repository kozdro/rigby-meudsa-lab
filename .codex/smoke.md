# Harness v2 smoke protocol

`pnpm harness:smoke` runs A then B in fresh persisted local Codex sessions.
`pnpm harness:smoke -- A` or `-- B` selects one scenario. These calls consume
normal Codex usage. Project AGENTS.md supplies automatic routing; scenario prompts
contain requirements, file boundaries and dependencies, never lists of roles.
The verifier has separate role expectations and reads actual spawn records,
independent child threads and loaded agentRole values. No generic-role fallback.

Each run creates ignored `.harness-runs/<id>/` inside this repository:
fixtures, raw events, child rollout copies, fixed check logs and summary.json.
Only this owned directory may be edited by the scenario session. Keep the directory
for review; remove a specific completed run manually when its evidence is no longer
needed. It is never installed in the apps, routes or production builds.

For B only, the CLI invocation sets `sandbox_workspace_write.network_access=true`
to permit the required loopback HTTP server inside workspace-write. This also allows
outbound network for that invocation; it is not a loopback-only security policy.
No project/global permission default changes. Tests bind only 127.0.0.1 on port 0.

A: a small Vue SSR notice with fixed Polish copy. Only frontend implementation
and review are necessary; Explorer is optional if context is unfamiliar. No backend
or independent QA role is needed. A fixed runner-owned assertion checks real output.

B: test-only HTTP server (`GET /notice`) -> async Vue SSR notice. The original
requirements define success, blank fallback, JSON shape, unknown-route failure,
HTTP error propagation and escaped text. Independent test ownership is available
before implementation. Backend/frontend contracts must agree before parallel work;
QA test execution follows both implementations; independent reviews follow TEST.
The verifier checks actual typed roles, child completion, concurrent turn count,
reviewer patch/fileChange attempts and absence of nested delegation. Command-side
mutations, ownership and sequencing also require independent trace review. Runner-owned assertions plus authored QA
tests execute independently of agent prose. This is real loopback HTTP + Vue SSR,
not a live Medusa/Nuxt/browser integration test. It requires no DB or credentials.

C is intentionally interactive in the current chat, not an unattended CLI test.
Use brainstorming-lite for the ambiguous request: "Pokaż klientowi informację o
dostępności produktu". Consult available context, ask ONE concrete product question,
explain options/tradeoffs if useful and hold dependent implementation until answered.
Do not generate source files for C, even after answering: this is a conversation-only
exercise. Record the actual question, answer/pending status and client limitations
in verification-v2.md. Automated A/B success never implies C passed.

VS Code: check actual tool-role availability in the current session. An existing
session can retain old roles/skills. Start a fresh VS Code Codex session after config
changes and execute a requirement-only A/B prompt to establish IDE-specific routing.
Fresh CLI/app-server results prove that local runtime only. Report an IDE reload or
unavailable role as NOT_VERIFIED, never as simulated success.
