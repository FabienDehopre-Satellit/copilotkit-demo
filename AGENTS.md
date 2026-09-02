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
| [`docs/runsheet.md`](./docs/runsheet.md) | What to start, check, and do when it breaks on the day. Written, per section 12. | When changing anything about how the demo is run. |

`CONTEXT.md` is not a suggestion. If a term in it has a synonym you were about to use, use the
term in `CONTEXT.md` instead. The most commonly broken ones: a `status` is never a *column* or a
*lane*, an `assignee` is never an *owner*, a Teammate is not an Assignee, and the two versions are
always *Phase 1* and *Phase 2*, never *v1*/*v2* and never named after their stacks.

Section 15 of the spec indexes every decision back to the ticket that settled it. When the spec
seems arbitrary, that table is where the reasoning is.

## State of the repo

**Every beat is built, both phases.** `main` carries the pnpm workspace, the root lockfile, `app/` — an
Angular 22 app rendering the Seed as eight Tasks in three columns with `<copilot-chat>` beside it —
`runtime/`, a Node CopilotRuntime on 8200 running `BuiltInAgent` against OpenAI, and `mcp/`, the
stdio Team directory the runtime spawns. Beats 1 to 6 play: type a question into the chat and get a
live answer back, the agent answers about the Board because `App` hands it one
`connectAgentContext()` entry, it changes the Board through the four mutating tools, a tool call
comes back as UI, and a directory lookup chains into `assignTask` in a single turn. Beat 7 plays off
the `phase-2` branch, described below.

**Reset demo** sits in the header and does both halves: the Board signal goes back to `SEED_TASKS`
and `threadId` takes a fresh id, bound into `<copilot-chat [threadId]>`, which is what empties the
transcript. Section 2 of the spec is the authority on why, including what binding the thread id
costs.

**All five tools are registered in Angular**, in `board-tools.ts`, against a root `BoardStore` that
owns the Board signal and is the only thing that writes to it. `deleteTask` is the one destructive
verb and the only one that confirms, through `registerHumanInTheLoop` and the `DeleteConfirm`
component. `tools[]` on the runtime is empty and stays empty — every Board tool is a frontend tool,
which is what makes phase 2 a config swap rather than a port.

**All five put a component in the transcript**, through `component:` on their registration —
Angular's spelling of React's `render`. Besides `DeleteConfirm` above, `createTask` renders a Task
card via `CreatedTask`, unconditionally, and `showBoard` — the one rendering tool, which writes
nothing — renders the mini three-column board via `MiniBoard`. `moveTask` and `assignTask` share
`ToolOutcome`, which prints the one sentence their handler already returned and nothing else.

**The Team directory is a separate process the app has never seen.** `mcp/` is a top-level member,
not a subfolder of `runtime/`, holding a `@modelcontextprotocol/sdk` stdio server that reads
`directory.json` and exposes two snake_case tools, `find_teammates` and `list_team`. The runtime
spawns it at startup through `Experimental_StdioMCPTransport` wrapped in a caching
`MCPClientProvider` in `team-directory.ts`, attached as **`mcpClients`** — never `mcpServers`, which
is http/sse-only and silently skips anything else. Nothing about the directory is in the system
prompt: the tool descriptions are the whole of how the agent finds it. Section 7 of the spec is the
authority, including why the answer has to be Ines.

**A wildcard `registerRenderToolCall({ name: '*' })` in `App` renders `ToolCallPanel`**: tool name,
arguments, raw result, always expanded and deliberately plain. It sits below every named
registration, and CopilotKit matches the frontend tier on `component !== undefined`, so a tool
without one is not a lower-priority match, it is no match at all and falls through to the wildcard.
That is why all five carry a component: the wildcard is left catching exactly the two MCP tools it
is there for, and the plain panel appears once in the talk, in beat 6.

**Phase 2 is `agent/agent.cs` plus one changed line of Angular.** `agent.cs` is a file-based C# app
— `dotnet run agent.cs`, .NET 10, no `.csproj`, one screen — that pins its packages inline, loads
the same root `.env` through `DotNetEnv`, and exposes one `AsAIAgent` over AG-UI on 8888 with
`AddAGUIServer()` and `MapAGUIServer("/", agent)`. Its system prompt is copy-pasted verbatim from
the runtime's `BuiltInAgent` and there is no shared-file mechanism, on purpose. It registers **no
backend tools**: the five Board tools stay in Angular and ride `RunAgentInput.tools`, which is what
makes the swap a config change.

**The eleven-line middleware in `agent.cs` is not optional and must not be tidied away.**
`MapAGUIServer` reads `messages`, `tools` and `resume` and *drops* `context`, verified twice in
issue #15, so without the `.AsBuilder().Use(...)` block between `AsAIAgent(...)` and `.Build()` the
Board never reaches the model and beat 7 fails live on resolving "the profile page" to `T-4`. The
AG-UI package version is pinned exactly for the same reason: a future preview that starts folding
context in itself would put the Board in the prompt twice. Section 8 of the spec is the authority.

**`RewrapFrontendTools` and `FrontendTool` are the second load-bearing workaround, found by running
beat 7 rather than by reading anything.** After a turn has run a frontend tool, AGUI.Server 0.0.5
reads every later turn in the thread as a *continuation* and re-declares the not-yet-called tools
as bare `AIFunctionDeclaration`s. A declaration is not invocable, so nothing stops on it and the
continuation branch of the event mapping swallows the function call rather than emitting
`TOOL_CALL` — the chat answers beat 7's first prompt and goes dead on the second. The fix presents
each declaration as the approval-required function AGUI.Server 0.0.6 would have handed over.
**0.0.6 itself is not an option**: it writes explicit JSON nulls where `@ag-ui/client` 0.0.57 —
the version `@copilotkit/angular` 0.3.1 pins — expects the field absent, and its zod parse rejects
`RUN_STARTED` outright, which kills every turn instead of the second one. Nothing here is in the
spec; it is a preview-package bug found on the way to making the beat play. Section 8 of the spec
now carries it too, under "The continuation fix".

**`phase-2` forks from `main` and its whole diff is `app/src/app/app.config.ts`** — `runtimeUrl`
swapped for `selfManagedAgents: { default: new HttpAgent({ url: 'http://localhost:8888/' }) }`, plus
the `@ag-ui/client` import. One file, six lines, and that diff goes on a slide, which is why
`@ag-ui/client` is a declared dependency of `app/` on `main` even though nothing on `main` imports
it: earning it on the branch would make the diff three files. Nothing in `app/` calls `runAgent`
itself — `<copilot-chat>` does it, through `copilotkit.core.runAgent({ agent })` — so if a run is
ever kicked off by hand, it goes through `copilotkit`, never `agent.runAgent()`, which silently
drops registered tools. Section 9 of the spec is the authority, including why an env-var toggle in
one checkout was rejected.

**`docs/runsheet.md` is written, and on any question of what the machine does on the day it beats
the spec.** The spec predicted `pnpm dev` would print four names; it prints three, and section 5
and section 12 were corrected rather than the Runsheet written to match them. Everywhere else the
spec stays the authority, section by section, as the rest of this file says. The Runsheet carries
the five processes, the three-tab window, the running order with every pinned prompt, the
night-before and at-the-door lists, recovery, and rehearsal. It copies the pinned prompts out of
section 10 on purpose — you cannot present from a document that sends you to another file for the
words you are typing — so a prompt reworded in rehearsal has to be changed in both.

**The root `README.md` is written, for whoever clones the repo after the talk.** One README, no
per-folder ones. It carries what the demo is, the two-branch map, the prerequisites, the run story
per phase, how to run both phases at once — the second worktree on 4300, and why the agent starts
only once — and a five-file "what to look at" list. It carries no beats and no pinned prompts: those
belong to the spec and the Deck, and a fourth copy of them is a fourth thing to keep in step.
Section 5 of the spec is the authority.

`pnpm-workspace.yaml` lists all five members and one of them is still an empty name: `slides/`
(Slidev). pnpm ignores a member whose directory is absent, so `pnpm install` and `pnpm dev` both
work today. Section 5 of the spec is the authority on what it becomes, and the Runsheet already
assumes it exists: `pnpm present` on 3030 and `slides/deck.pdf` as the only fallback.

So `pnpm dev` starts `ng serve` on 4200, the runtime on 8200 and the C# agent on 8888. Three names
in the stream is correct, not a broken install: `mcp` has no `dev` script on purpose, because the
runtime spawns it. **Beat 7 does not start a second agent.** The phase-2 tab is a second git
worktree at `../copilotkit-demo-phase2` on `phase-2` running only `ng serve --port 4300`, pointed at
the 8888 agent that `main`'s `pnpm dev` already started; the switch on stage is a browser tab.

**Both tiers need a key to start doing anything.** Copy `.env.example` to `.env` at the repo root
and put a real `OPENAI_API_KEY` in it. The runtime loads it with `process.loadEnvFile('../.env')`
and `agent.cs` with `Env.Load("../.env")`, which has to run before `WebApplication.CreateBuilder`
because ASP.NET's environment-variable provider snapshots the environment as it is added. There is
no other configuration, and nothing is ever `export`ed into a shell.

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
