---
name: write-spec
description: Design stage of the SDLC. Turn an accepted intent into a requirements and design spec.md with flagged concerns, and commit it for the product owner. Usage: /write-spec <intent slug or path>
disable-model-invocation: true
---

Turn one accepted intent into `spec/<slug>.md`: the **spec** the engineering side plans against, requirements and design in one document, with every point an analyst would have escalated written up as a **concern**. The run ends at the pull request; the product owner reviews the spec, never writes it, and merging it is what starts the Build stage.

The run must work unattended: a merged intent can trigger it with nobody in the session. So every judgement call you cannot settle from the repository becomes a concern or an open question in the spec, never a question to the user.

## 1. Take in the intent

Resolve the argument to `intent/<slug>.md` and confirm it is on `main` (`git log -1 --format='%h %cs' main -- intent/<slug>.md`): an intent that only lives on its own branch is not accepted yet, so stop and say so. The originator's words are the source of truth; the spec answers them and never rewrites them.

When `spec/<slug>.md` already exists, this is a revision: work on it instead of starting over, and keep what the product owner already settled.

## 2. Load the policies

The **policies** are this repository's standing rules, and they bind the spec the way an organisation's brand, security and UX guidelines would. Read every one that touches the systems the intent names:

- `CONTEXT.md`: the vocabulary. The spec names every concept with its glossary term.
- `docs/adr/`: each accepted ADR is a decision the spec builds on, not one it re-decides (`docs/agents/domain.md` covers conflicts).
- `docs/architecture.md`, and the code of every module the intent names.
- `AGENTS.md`, section _Documentation_: which docs pages the change must update in the same pull request. The `vitepress-docs` skill governs those pages.

Record each source you applied with the commit it was read at (`git log -1 --format=%h -- <path>`); the spec lists them, so the policy version behind every decision stays in version control.

Loaded when you can name, for each system the intent touches, the ADRs that bind it.

## 3. Write the spec

Write `spec/<slug>.md`, same slug as the intent:

```markdown
---
title: <outcome, as in the intent>
intent: intent/<slug>.md
intent_commit: <short hash of the intent on main>
status: draft
created: <YYYY-MM-DD>
policies:
  - <path>@<short hash>
---

# Spec: <outcome>

## Problem
<the intent's problem in two or three sentences, linked, not restated>

## Requirements
R1. <one observable behaviour, testable from outside> (intent: <section it answers>)

## Design
<how it fits the existing codebase: the modules, tasks, routes, tables and
migrations, configuration and settings it touches, each by its real path and
glossary name; the docs pages it updates>

## Decisions
<each choice the design makes, the alternative it rejects and why; a decision
with long-term effect is marked "ADR candidate">

## Open questions from the intent
<every open question of the intent, each answered (and where) or carried
forward to the Build stage with the reason>

## Concerns
C1. <what> -- policy: <ADR, glossary term or constraint> -- owner: <who decides>
    Options: <the ways it could be resolved>

## Out of scope
<the intent's out of scope, plus what this spec deliberately defers>
```

Hold each part to its bar:

- **Requirements**: every outcome of the intent is covered by at least one requirement, and every requirement traces back to the intent. A requirement nothing in the intent asks for is scope creep: move it to _Out of scope_ or raise it as a concern.
- **Design**: grounded. Every path, task name and table you name exists, or the design says it is new.
- **Concerns**: everything a policy cannot settle. Two policies that contradict each other, a requirement that would break an ADR, a gap no policy covers, a risk with an external effect (Slack, GitHub, money, data loss). Write the conflict itself; when you cannot satisfy both sides, say so plainly instead of choosing quietly. The **owner** is the person a policy names, else the product owner.

A section with nothing to say gets `None.`

## 4. Check the spec against the intent

Reread the intent, then the spec, as the product owner will: does the spec solve the problem the intent names, and is every open question answered or carried forward? Then walk the concerns once more for anything you settled silently in the design.

Done when every intent outcome maps to a requirement, every intent open question appears under _Open questions from the intent_, and every design choice a policy does not settle is either a decision with its reason or a concern.

## 5. Commit for the product owner

Branch `spec/<slug>` off `main`, commit only the spec, push, and open a pull request titled `Spec: <outcome>`. The body links the intent and lists the concerns as a checklist, first thing in the body: the product owner works through them with each owner before anything else, and a concern that yields a decision with long-term effect gets its ADR before the merge.

The merge is the acceptance that moves intent and spec together into the Build stage; the product owner consults a technical lead first on anything with an external effect or an ADR change. Closing the pull request is the rejection.

Done when the pull request URL is reported, together with the number of concerns.
