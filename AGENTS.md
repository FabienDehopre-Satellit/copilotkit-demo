# AGENTS.md

A CopilotKit-for-Angular demo built for one internal Satellit talk. The audience is .NET
developers with some Angular and near-zero agent experience. Everything here serves a live
65-minute run in front of that room, which is why several of the constraints below would be wrong
in a normal product repo.

## Read these first

| document | what it is | when to read it |
|---|---|---|
| [`CONTEXT.md`](./CONTEXT.md) | The glossary. Binding on code, UI copy, on-stage prompts, and slides. | Always, before writing anything. |
| [`docs/demo-spec.md`](./docs/demo-spec.md) | The build-ready spec. Self-contained: build from it without opening an issue. | Before any implementation work. |
| `docs/runsheet.md` | What to start, check, and do when it breaks on the day. Not written yet — it is a deliverable of the build, specified in section 12. | When changing anything about how the demo is run. |

`CONTEXT.md` is not a suggestion. If a term in it has a synonym you were about to use, use the
term in `CONTEXT.md` instead. The most commonly broken ones: a `status` is never a *column* or a
*lane*, an `assignee` is never an *owner*, a Teammate is not an Assignee, and the two versions are
always *Phase 1* and *Phase 2*, never *v1*/*v2* and never named after their stacks.

Section 15 of the spec indexes every decision back to the ticket that settled it. When the spec
seems arbitrary, that table is where the reasoning is.

## State of the repo

**The Board and the chat are built.** `main` carries the pnpm workspace, the root lockfile, `app/`
— an Angular 22 app rendering the Seed as eight Tasks in three columns with `<copilot-chat>` beside
it — and `runtime/`, a Node CopilotRuntime on 8200 running `BuiltInAgent` against OpenAI. Beat 1
plays: type a question into the chat, get a live answer back.

Nothing past that is wired. The agent can neither read the Board nor change it, because there is no
`connectAgentContext()` entry and no tool of any kind yet, and no `mcpClients` on the
`BuiltInAgent`. `tools[]` on the runtime is empty and stays empty — every Board tool is a frontend
tool, registered in Angular.

`pnpm-workspace.yaml` lists all five members, but three of them are still empty names: `mcp/`
(stdio team-directory server), `agent/` (a file-based C# app), and `slides/` (Slidev). pnpm ignores
a member whose directory is absent, so `pnpm install` and `pnpm dev` both work today. Section 5 of
the spec is the authority on what the other three become.

So `pnpm dev` starts `ng serve` on 4200 and the runtime on 8200. Two names in the stream is correct
right now, not a broken install.

**The runtime needs a key to start doing anything.** Copy `.env.example` to `.env` at the repo root
and put a real `OPENAI_API_KEY` in it. There is no other configuration, and nothing is ever
`export`ed into a shell.

## There are no automated tests, on purpose

Section 14 of the spec rules them out. Angular is scaffolded with `--skip-tests`, and empty
`.spec.ts` files are noise in a repo people will clone after the talk.

So: don't add a test runner, don't scaffold spec files, and don't write acceptance criteria that
assume a suite exists. `/implement` drives `/tdd` by default — that default does not apply here.

**Verification is running the demo.** Section 10 gives seven beats, each with the literal prompt
typed on stage and the Board state expected after it. Those beats are the acceptance criteria. A
change is verified when the beats it touches still play.

## Standing constraints

These are decisions, not preferences. Each one is argued in the spec; changing one means
re-opening that argument, not just editing the code.

- **Exact versions, no ranges**, hoisted into pnpm's default catalog. `ng new` and `ng add` write
  carets and know nothing about catalogs, so scaffold first and hoist by hand afterwards.
  `@angular/cdk` must match Angular's major.
- **No build step** for `runtime/` and `mcp/`. Both run under `tsx` straight off source, so the
  file open on a slide is the file that is running. No `dist/`. `tsc` type-checks and never emits.
- **Bare package names** — `app`, `runtime`, `mcp`, `agent`, `slides`. `--parallel` prefixes output
  with them, and that stream is projected. A `@demo/` scope reads as noise from the back row.
- **Ports are hard-coded in code**, no env indirection: app 4200, runtime 8200, agent 8888,
  slides 3030.
- **Angular uses an absolute `runtimeUrl` and the runtime sets `cors: true`. No dev-server proxy.**
  Phase 2 points the browser at a different origin, so a proxy would be phase-1 scaffolding that
  the phase-2 branch has to delete.
- **One root `.env`, git-ignored, `OPENAI_API_KEY` only.** Nothing reads it automatically, so both
  sides load it explicitly — `process.loadEnvFile('../.env')` in the runtime, `Env.Load("../.env")`
  in `agent.cs`. Never tell anyone to `export` it in their shell.
- **The model is pinned in code on both sides and the two must match** (`openai/gpt-5-mini` in the
  runtime, `gpt-5-mini` on the agent's OpenAI client). Beat 7 re-runs prompts the room saw twenty
  minutes earlier, so a mismatch reads as "the .NET one is slower" rather than as a bug.
- **`main` is Phase 1 and stays the default branch. Phase 2 is `phase-2`**, forked from `main`.

## Conventions

Commits are Conventional Commits, lowercase subject, referencing the issue that motivated them —
`docs: the build-ready demo spec (#11)`.

Work lands via pull request, never a direct push. Branch off the target branch — `main` for
Phase 1, `phase-2` for Phase 2 — naming the branch `<commit-type>/<slug>` to match the commit
that lands it. Open the PR with `gh pr create` referencing the issue, and leave merging to a human.

Documentation prose is dense and declarative: state the decision, then why the alternative lost.
Match `CONTEXT.md` and the spec rather than a neutral house style.

The spec, the Runsheet, and the Deck have three different readers and are never merged. The spec
is read once by whoever builds this. The Runsheet is read every time the talk is given. The Deck is
what the room sees.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, driven through the `gh` CLI. See
[`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, each label string equal to its name. See
[`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md).

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See
[`docs/agents/domain.md`](./docs/agents/domain.md).
