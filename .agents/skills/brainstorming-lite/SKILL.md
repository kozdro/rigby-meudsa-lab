---
name: brainstorming-lite
description: Resolve material ambiguity in rigby-medusa-lab requirements before dependent implementation. Distinguish missing business decisions from technical unknowns; clear small tasks proceed without extra questions or documents.
---

# Brainstorming lite

Use repository context and the current request first. For a clear task, state
observable acceptance criteria briefly and proceed; no extra question, design
document, approval round or compulsory ceremony.

When something material is missing:

1. Identify what would change observable behavior, scope or acceptance criteria.
2. Classify the gap. Technical unknowns go to the built-in Explorer, installed
   source/types or focused Context7 documentation. Do not ask the user to supply
   technical knowledge that can be discovered. Existing confirmed product rules
   in the repository or conversation can resolve a product question too.
3. A missing business/product decision belongs to the user: audience, visibility,
   policy, permissions, pricing, intended outcome. Never present an unconfirmed
   assumption as their decision. Offer two or three concrete options with short
   tradeoffs when useful; recommend an option only with a reason.
4. Ask ONE concrete question at a time, only if the answer is needed. Use the
   available interactive question tool; otherwise ask in chat. State which work
   depends on the answer. Do not ask the user to choose agents or approve routine
   delegation. Silence, elapsed time or a preselected option is not an answer.
5. Wait for that answer before dependent implementation. Independent exploration,
   harness checks or unrelated authorized work may continue. If waiting ends the
   turn, leave the dependency explicitly pending. Once answered, update the short
   acceptance criteria and continue the normal harness workflow.

A reversible technical choice that follows existing patterns is Orchestrator's
call; disclose a consequential choice briefly. An unresolved business decision
cannot be replaced with that rule. No automatic spec files, commits, visual
companion, full-design approval gate or additional Superpowers workflow.

## Source and deliberate adaptation

Inspired by the original [Superpowers Brainstorming](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md),
read on 2026-10-19: understand intent, build on existing context, ask focused
questions and scale the process to the work. This is a small project-specific
skill, not an installation or copy of Superpowers. Its broader design/approval,
artifact and follow-on workflow requirements do not apply here.
