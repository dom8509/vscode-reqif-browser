---
name: capture-intent
description: Plan stage of the SDLC. Brainstorm an idea, ticket or incident into an intent.md proto-spec and commit it for the product owner. Usage: /capture-intent [idea, issue number or alert]
disable-model-invocation: true
---

Turn one idea into `intent/<slug>.md`: a **proto-spec** in the originator's own words, saying what is wanted, why, and under which constraints. This is the whole Plan stage. The requirements, the design and the `spec.md` belong to the Design stage (`/write-spec`) that picks the intent up; the run ends at the pull request.

The **originator** is whoever the idea comes from: the user in this session, the author of the GitHub issue, or the alert behind an incident. Their words are the source of truth, so the intent quotes and paraphrases them; your own proposals go under _Open questions_.

## 1. Take in the trigger

Read the arguments. An issue number: `gh issue view <n> --comments`. An alert or incident: the job, log or error it names. A bare idea: the user's words. Then scan `intent/` for an intent covering the same ground; when one exists, extend it instead of opening a second.

## 2. Brainstorm until concrete

Ask the questions an **analyst** would ask, a few per round, and let the originator answer in plain language:

- **Problem**: what cannot be done today, and what it costs.
- **Users**: who is affected, and which systems (read `CONTEXT.md` and the code to name them precisely instead of asking).
- **Outcome**: what better looks like, observable from outside.
- **Constraints**: what must stay as it is.
- **Scope**: what is explicitly out.

Concrete when you reach a shared understanding, every section of the template below can be filled from the originator's answers, and each remaining uncertainty is written as an open question instead of your guess.

## 3. Write the intent

Pick a kebab-case slug from the outcome and write `intent/<slug>.md`:

```markdown
---
title: <outcome in a few words>
author: <originator>
role: <originator's role, e.g. product owner, operator>
source: <issue #123 | alert <name> | capture-intent session>
status: draft
created: <YYYY-MM-DD>
---

# Intent: <title>

## Problem
<what cannot be done today, and its cost>

## Proposed outcome
<what better looks like>

## Affected users and systems
<people, services, tasks, APIs>

## Constraints
<what must hold>

## Out of scope
<what this intent does not ask for>

## Open questions
<each one a question the product owner or the Design stage answers>
```

The front matter is YAML, so a reader and a tool see originator, source, status and date without the git log.

Keep it to what was said: no solution design, no task list, no estimate. A section with nothing to say gets `None stated.`

## 4. Let the originator correct it

Show the file and ask what was misunderstood. Rewrite until the originator confirms it says what they meant.

## 5. Commit for the product owner

Branch `intent/<slug>` off `main`, commit only the intent file, push, and open a pull request titled `Intent: <outcome>`, linking the source issue when there is one. The product owner's merge is the acceptance that moves the intent into the Design stage, and closing the pull request is the rejection.

Done when the pull request URL is reported to the user.
