---
name: build-spec
description: Build stage of the SDLC. Implement an accepted spec as tracer-bullet slices, test first, and open the pull request for review. Usage: /build-spec <spec slug or path>
disable-model-invocation: true
---

Turn one accepted `spec/<slug>.md` into working code on `build/<slug>`: a sequence of **tracer bullets**, each a thin vertical **slice** through every layer it needs (migration, model, task, route, CLI, docs), each one test first. The run ends at the pull request; a person reviews and merges it.

The run must work unattended, like `/write-spec`: a merged spec can trigger it with nobody in the session. Every judgement call the spec and the repository cannot settle becomes a **deviation** in the pull request, never a question to the user.

## 1. Take in the spec

Resolve the argument to `spec/<slug>.md` and confirm it is on `main` (`git log -1 --format='%h %cs' main -- spec/<slug>.md`): a spec that only lives on its own branch is not accepted yet, so stop and say so. Read the spec, the intent it names, and the merged spec pull request with its comments (`gh pr list --state merged --head spec/<slug>`, then `gh pr view <n> --comments`): how each concern was resolved lives there.

When `build/<slug>` already exists, this is a resumption: check out the branch, read the draft pull request's slice checklist, and continue at the first unticked slice.

## 2. Load the policies

Read every source in the spec's `policies:` list at its current version, plus `docs/agents/domain.md`. When a source changed since the spec's commit (`git log --oneline <hash>..main -- <path>`), read the change: a policy that moved under the spec is a deviation.

## 3. Cut the slices

Cut the requirements into tracer bullets, in the order that makes the first one hit end to end as early as possible:

- A slice is **vertical**: it delivers one observable behaviour from the outside (a CLI command, an API route, a job's terminal state), cutting through every layer that behaviour needs. A slice that only adds a model or only a migration is horizontal: fold it into the first slice that uses it.
- Every slice names the requirements it covers (`R1, R3`); every requirement lands in exactly one slice.
- The first slice is the thinnest path that proves the design holds; the later ones widen it.

Branch `build/<slug>` off `main`, push, and open a **draft** pull request titled `Build: <outcome>`, its body a checklist with one box per slice. The draft is the checkpoint a resumed run reads.

Cut when every requirement sits in a slice and every slice has an outside observable.

## 4. Build each slice, red first

For each slice, in order:

1. **Red**: write one test through the public interface the slice delivers (`tests/unit`, or `tests/integration` when the behaviour lives in the database). Run it and watch it go _red_ for the reason the slice names, not on an import or fixture error.
2. **Green**: write the least code that turns it green. Name every concept with its `CONTEXT.md` term.
3. Repeat red and green for the slice's next behaviour until its requirements are covered.
4. **Refactor** with the tests green: remove duplication, deepen the module you touched, keep the diff reading like the surrounding code.
5. **Docs**: update what `AGENTS.md`, section _Documentation_, asks for in the same slice: the guide, the architecture page, a docstring, `--help` or `#:` comment the generated reference reads. A spec decision marked "ADR candidate" gets its ADR in the slice that makes it real (`docs/agents/domain.md` covers the number).
6. Run `./scripts/check.sh`, plus `--integration` when the slice touches the database. Commit the slice with a message that says what a person or agent can now do, as the log on `main` does. Push and tick the slice's box.

A slice is done when its tests went red before the code and are green after, and `./scripts/check.sh` passes.

When the spec turns out wrong or silent mid-slice (a path that does not exist, a requirement no design reaches, a policy it breaks), take the choice closest to the spec's intent, write it down as a deviation, and keep building. Stop only when no choice keeps the requirement: then leave the slice unticked and write why.

## 5. Review with fresh eyes

Dispatch a subagent with fresh context and give it the spec path, the intent path and `git diff main...build/<slug>`. Ask it to check, and report each finding with its file and line:

- every requirement has a test that would go red without its code;
- the design matches the spec, or the difference is a deviation;
- every name follows `CONTEXT.md`, every binding ADR holds;
- the docs pages `AGENTS.md` asks for are updated.

Fix each finding that holds and run `./scripts/check.sh` again. A finding you reject goes into the pull request with the reason.

## 6. Hand over

Rewrite the pull request body, and mark it ready for review:

```markdown
Spec: spec/<slug>.md · Intent: intent/<slug>.md

## Deviations
- [ ] <what differs from the spec, why, and who decides>

## Requirements
| Req | Slice | Test |
| --- | ----- | ---- |
| R1  | <slice> | <tests/...::test_name> |

## Slices
- [x] <slice>: <commit>
```

Deviations go first, as a checklist: the reviewer settles them before reading the code. Retitle the pull request with the outcome in the log's style (`A person can …`).

Done when the pull request is ready for review and its URL is reported, together with the number of deviations and any slice left unticked.
