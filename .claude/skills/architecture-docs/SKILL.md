---
name: architecture-docs
description: Writing a system's architecture documentation, an overview plus one page per flow or component. Use when creating an architecture section, or adding or revising one of its pages.
---

# Architecture docs

An architecture section explains **how the system works and why it is built that way**, so a reader can predict its behaviour and knows where a change goes. It is made of one **overview** and one **page per flow or component**. Every sentence is a **claim** the code can confirm, every claim has an **anchor** (the file, symbol, constraint or test where it is true), and every deliberate choice links its **decision** (the ADR or design note that made it so).

How-to steps belong in guides and exhaustive field lists in generated reference; the architecture page links both and carries the mechanism and the reasons.

## 1. Survey the system

Read the code, not the old docs: entry points and deployables, stores, external systems and the protocol to each, the package layout, the decision records. Done when you can list **every** running process, **every** store, **every** external system and **every** trust boundary (public entrance, network edge, privilege change), each with its anchor.

## 2. Cut the pages

One page answers one question: _what happens to an X from start to end_ (a **flow**: a request, a job, a message) or _what is X and what does it promise_ (a **component**: the data model, configuration, security, deployment, tech stack). Name the page after the thing, never after the team or the code directory. Done when every item of the survey belongs to exactly one page, and no page needs a second diagram type to tell its main story.

When the section does not exist yet, write the overview first: [`OVERVIEW.md`](OVERVIEW.md).

## 3. Write each page

**Lead.** `# Title`, then two to four sentences: what the thing is, its central claim, and the decision behind it. "A task never sends anything" beats "This page describes delivery".

**One mechanism diagram**, right after the lead, picked by the question the page answers:

| The page is about | Diagram |
|---|---|
| a lifecycle with states | `stateDiagram-v2` |
| who calls whom, in what order | `sequenceDiagram` |
| how data moves between parts | `flowchart LR` |
| tables and their relations | `erDiagram` |
| a directory or naming scheme | a `text` block |

Draw the real mechanism: node names are the names in the code, edge labels say what crosses (`claim, SKIP LOCKED`, `signed webhook`), and the diagram matches the code today.

**Body sections**, each a heading and its claim. Use what the page has:

- **States** table `State | Meaning`, one row per enum value, with extra columns for what each state holds (lease, lock, visibility). Mark final states in bold.
- **The rules**: the few invariants the component keeps, as bullets with a bold leading phrase ("**One message per result.**") and the mechanism that enforces each.
- **Contract**: the interface a new implementation fulfils (type, method, the errors it raises), then a table of the implementations with `Name | Target | Notes`, then the link to the guide that adds one.
- **Policy / settings**: `Field | Meaning | Default` for the knobs that change behaviour, not every field.
- **Failure and edge cases**: what happens on crash, timeout, duplicate, cancel, and which outcome is the default when classification fails.
- **What leaves the system** / **who may do what**: the defaults that keep it safe, and how an operator sees a refusal.

**Guarantees table**, closing any page that makes promises: `Guarantee | Lives in | Test`. Each row is one claim, the constraint or code that enforces it, and the test that proves it. A guarantee with no test is written down as such.

**Links.** Decisions inline at the claim they justify (`… ([ADR 0004](…))`); the operator command where a person acts (`tool outbox dismiss KEY`); the guide for the how-to; the reference for the full list. Link, never repeat.

**Style.** Present tense, short declaratives, the system as subject. Name the mechanism ("a partial unique index", "one transaction") rather than an adjective ("robust", "safe"). Side paths and gotchas go into a callout; the main path stays in prose.

## 4. Verify against the code

Done when:

- every claim was checked against its anchor, and every symbol, path, table and command named on the page exists under that name;
- every state, adapter, table or process the code has appears where the page lists that kind, and the page lists nothing the code lacks;
- every decision link and page link resolves, and the docs build is green;
- every diagram that mirrors code with an enumerable set (states, tables, adapters) has a **drift guard**: a test that fails when the code and the diagram disagree. Add one where it is cheap; otherwise name the gap in the summary.
