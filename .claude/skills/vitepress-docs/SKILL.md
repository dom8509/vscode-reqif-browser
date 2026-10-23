---
name: vitepress-docs
description: Guidelines for a software product's VitePress documentation site. Use when creating a docs site, or adding or restructuring its pages.
---

# VitePress product docs

## Site structure

Nav = `Quickstart · Guides · Architecture · Reference · Concept`. Every page sits in the sidebar; a section's `index.md` is its overview.

| Path | Page | Content |
|---|---|---|
| `index.md` | Home | `layout: home`. Hero: `name` = product, `text` = claim in ≤5 words, `tagline` = one sentence what and how; actions `Quickstart` (brand), `What is X?`, one more (alt). Four `features`: each title a claim, details the reason. Below: `## What it looks like` with one diagram or code sample, 1–3 commands, a link to the quickstart. |
| `getting-started/index.md` | What is X? | What it is (bold one-liner), the problem it solves, what it is not, the core concepts. |
| `getting-started/quickstart.md` | Quickstart | Lead promises the result and the time ("…in ten minutes"). Steps as `## 1. …`, each runnable, each ends with what the reader now sees. |
| `getting-started/installation.md` | Installation | Prerequisites, install, verify. |
| `guides/` | How-tos | `index.md`: tables `Guide \| What you learn`, grouped by `##`. One guide = one task start to finish, imperative title ("Add a task"), numbered `##` steps. |
| `architecture/` | Architecture | Overview with a Mermaid system diagram; one page per flow or component (lifecycle, data model, security, deployment). The **tech stack** lives here as a table `Layer \| Technology \| Why`. Writing the pages: the `architecture-docs` skill. |
| `reference/` | Reference | API, CLI, configuration, and the **DSL** (language reference: syntax, every keyword, diagnostics), each only if the product has it. Generate from code (OpenAPI, `--help`, schemas, docstrings) wherever possible. |
| `concept/` | Concept | Design docs, roadmap and ADRs, copied from `docs/` at build time; edit them where they live. |
| `contributing/documentation.md` | Maintaining the docs | How pages are built, generated and checked. |

## Writing

- Every page opens with `# Title` and a one- or two-sentence lead: what the page does for the reader and where the basics or details live instead.
- Present tense, claims over descriptions: "A restart loses nothing", not "X has a persistence feature".
- A picture per concept: Mermaid (`vitepress-plugin-mermaid`), a code block the reader can paste, or both.
- `::: tip` / `::: warning` for the side path (the alternative tool, the gotcha); the main path stays in prose.
- Link, never repeat: the quickstart links guides, guides link reference.

## Theme

Default VitePress theme, `cleanUrls`, `lastUpdated`, local search, a logo, a GitHub social link. `.vitepress/theme/style.css`:

```css
:root { --vp-c-brand-1: #1d4ed8; --vp-c-brand-2: #2563eb; --vp-c-brand-3: #3b82f6; --vp-c-brand-soft: rgba(37,99,235,.14); }
.dark { --vp-c-brand-1: #93c5fd; --vp-c-brand-2: #60a5fa; --vp-c-brand-3: #3b82f6; }
.vp-doc .mermaid { margin: 16px 0; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg-soft); text-align: center; overflow-x: auto; }
```

## Done when

`vitepress build` is green with dead-link checking on, every sidebar entry resolves, every quickstart step was run against the real product, and each section the product has (API, DSL, CLI) has its reference page.
