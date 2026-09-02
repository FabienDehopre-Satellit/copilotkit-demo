# Demo spec

Build-ready spec for the CopilotKit-for-Angular demo behind the internal Satellit talk.

Everything here was decided on the [wayfinder map](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/1)
and its tickets. Each section links back to the ticket that settled it. Where two tickets disagreed,
the later one won and this document carries only the winner, so you can build from this file alone
and never open an issue.

Read [`CONTEXT.md`](../CONTEXT.md) first. It is the glossary, and the words in it are the words used
in code, UI copy, on-stage prompts, and slides. If a term here has a synonym you were about to use,
use the term here instead.

Three documents, three readers. This spec is read once, by whoever builds the demo. The
[Runsheet](#12-the-runsheet-docsrunsheetmd) is read every time the talk is given. The Deck is what
the room sees.

---

## 1. What is being built

An Angular task board with a CopilotKit chat panel, in two phases.

**Phase 1** (branch `main`): Angular talks to a Node CopilotRuntime running CopilotKit's
`BuiltInAgent`, which talks to OpenAI. A local stdio MCP server hangs off the runtime and owns a
team directory.

**Phase 2** (branch `phase-2`): Angular talks straight to a Microsoft Agent Framework agent written
in C#, exposed over AG-UI. No Node tier.

Everything the audience sees the app *do* is identical across the two. That sameness is the argument
of the talk.

### Audience

Mostly .NET developers at Satellit. Some Angular exposure, near-zero agent experience
([#7](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/7)). Two consequences that
shaped the whole plan. Tool-calling and AG-UI each need defining from scratch. And phase 2 is home
turf rather than an epilogue, so it gets a real C# read-through and ~14 minutes.

### Governing build criterion

Legibility from the back of the room beats completeness. When a choice is between correct and
readable on a projector, pick readable, and say out loud what you skipped.

---

## 2. Domain model

Settled in [#6](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/6), revised by
[#7](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/7).

`Task` is the only entity.

| field | type | notes |
|---|---|---|
| `id` | `string` | human-readable, `T-1` … `T-8` |
| `title` | `string` | 5 words or fewer, it gets read off a projector |
| `description` | `string` | one line, gives the rendered Task card something to show |
| `status` | `'todo' \| 'doing' \| 'done'` | the three columns *are* this enum |
| `assignee` | `string \| null` | a first name, `null` when unassigned |

No `Column`, no `Label`, no due date, no priority. `Column` was rejected outright as a second noun
for something `status` already says, and every field is re-serialised to the model on every turn.

Vocabulary rules that must hold in code, UI copy, prompts, and slides alike:

- `status`, never *column* and never *lane*. The UI renders one column per status. The column is a
  rendering, not a thing.
- `assignee`, never *owner*. Unassigned is `null`, never the string `"unassigned"`.
- `done` is terminal. No *archived*, no soft delete. That is what makes `deleteTask` the one
  destructive verb worth confirming.

### The Seed

Eight Tasks, 3 todo / 3 doing / 2 done, about an employee onboarding portal. Deliberately not an AI
project, so nothing on the board competes for meaning with what the agent is doing. These titles are
spoken aloud in pinned prompts, so they are exact
([#7](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/7)).

| id | title | status | assignee |
|---|---|---|---|
| T-1 | Design the welcome email | todo | Amira |
| T-2 | Import the HR spreadsheet | todo | Chloé |
| T-3 | Pick an SSO provider | todo | **null** |
| T-4 | Build the profile page | doing | Amira |
| T-5 | Write the equipment checklist | doing | Bruno |
| T-6 | Set up the staging environment | doing | Bruno |
| T-7 | Register the domain | done | Dries |
| T-8 | Draft the project brief | done | Chloé |

Three properties of this table are load-bearing and must not drift:

1. **T-3 is unassigned.** Beat 2 asks what is unassigned, beat 3 assigns it.
2. **Bruno holds exactly two Tasks (T-5, T-6).** Beat 4's ambiguity is two-way, which is legible from
   the back row. Seven-way ambiguity would let the model just pick one.
3. **T-7 is `done` and inert.** Nothing downstream depends on it, which is why it is the delete
   target.

`SEED_TASKS` is a frozen constant. The Board is an Angular signal initialised from it. In memory
only, no `localStorage`, no JSON file, so a reload is already a full reset.

### Reset

A visible **Reset demo** button in the app header restores the Seed **and** starts a fresh chat
thread. The second half is the point. A transcript reading "I've moved that to done" above a board
where it is not is the worst thing that can happen on stage, and resetting only the Board
manufactures exactly that.

Fresh thread id, set directly. **Never mount the threads drawer**, on either branch: it is genuinely
licence-gated and hangs in `licensePending` under `selfManagedAgents`
([#12](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/12)).

The id is bound into `<copilot-chat [threadId]>` rather than written onto the agent
([#27](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/27)). The binding is what
CopilotKit watches, and a thread id it has not seen is what makes CopilotKit clear the transcript;
setting `agent.threadId` by hand instead is silently reverted the next time the agent instance is rebuilt.
Binding it costs CopilotKit's welcome screen, which it hides whenever a thread id is explicit — so
an empty chat reads the same on a fresh load as after a Reset, and the pane no longer re-lays itself
out when the first message lands.

On-stage role of the button is **recovery only**
([#17](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/17)). Beat 7 does not press
it. See [§9](#9-the-branch-diff).

---

## 3. How the agent reads the Board

One `connectAgentContext()` entry, and that is the whole read channel
([#6](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/6),
[#3](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/3)).

```ts
connectAgentContext(() => ({
  description: 'The current task board',
  value: JSON.stringify(this.tasks()),
}));
```

Two rules, both of which will bite silently if broken.

**Pass an accessor, not an object.** `connectAgentContext` wraps an `effect()`. A plain object
registers once and never updates. The signature is
`connectAgentContext(context: Context | (() => Context), config?: { injector?: Injector }): void`,
and `Context` is `{ description: string; value: string }`, so you stringify.

**Call it from an injection context** (field initialiser or constructor), or pass an explicit
`Injector`. Teardown rides `DestroyRef`, so there is nothing to clean up.

Grouping context by status was rejected, since it duplicates a field. A prose summary was rejected,
since it throws away the ids the tools need. Eight Tasks of five short fields is roughly 300 tokens
per turn, re-sent every turn. Not a concern at this size.

### Shared state is rejected

`injectAgentStore()` works in Angular and is not used here. It gets one line on slide 9 and no beat.
Three reasons, in order of weight:

1. **Phase 2 needs zero state handling.** Context is a plain AG-UI `RunAgentInput.context` field.
   Shared state would mean emitting `STATE_SNAPSHOT` / `STATE_DELTA` from C#, on the branch that
   already carries the most risk.
2. The Board stays owned by Angular signals. One writer, so nothing on stage can desync.
3. Frontend tools are already a beat. Routing every mutation through them lets that beat carry the
   demo instead of competing with an invisible second channel.

Removing the talk's time cap did not reopen this. The argument was architectural, not budgetary
([#7](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/7)).

---

## 4. Tools

Five tools, all registered in Angular, none in Node or C#.

### Mutating tools

Every change to the Board goes through one of these four. Nothing else writes.

| tool | signature | confirms? |
|---|---|---|
| `createTask` | `(title, description?, status = 'todo', assignee?)` | no |
| `moveTask` | `(id, status)` | no |
| `assignTask` | `(id, assignee?)` | no |
| `deleteTask` | `(id)` | **yes** |

`moveTask` means "move X to done" and "mark X done" hit the same tool from two phrasings.
`assignTask` with no assignee unassigns, so there is no fifth verb for it — a literal `null` is the
honest encoding and does not survive the runtime, so the wire shape is an optional string. See
[§13](#nullable-parameters-do-not-reach-the-model). `deleteTask` is the only tool that confirms, via
`renderAndWaitForResponse`, which Angular spells `registerHumanInTheLoop`. Human-in-the-loop is a
property of this tool, not a beat of its own.

**Say in `deleteTask`'s description who does the confirming.** "The user is asked to confirm first"
reads to the model as its own job: it asks in prose, never calls the tool, and the dialog the beat
exists to show never renders. Naming the app as the thing that asks, and telling the model never to
ask itself, is what makes beat 3's third prompt land the dialog on the first turn.

Tools address a Task by `id`. The model resolves title to id from context. Human-readable ids mean a
wrong resolution is visible on stage instead of silently mis-targeting, and rehearsal can fall back
to "move T-3 to done" with no code change. An unknown id returns a readable error string the model
can correct from.

Every tool returns a short string.

### Rendering tool

`showBoard()` changes nothing and exists purely to put a mini three-column board in the chat. It is
the clearest possible statement of beat 5's point, which is why it earns a place despite
[#6](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/6) having rejected a fifth
tool on the first pass. The distinction between **mutating tool** and **rendering tool** is canonical
in `CONTEXT.md`.

### Rendering

- `createTask` renders its result as a **Task card**, via the `component:` field on
  `registerFrontendTool()`. Angular takes `component: Type<ToolRenderer>` where React takes a
  `render` function, so React snippets do not transfer verbatim.
- `showBoard` renders the mini board the same way.
- MCP calls render through a wildcard `registerRenderToolCall({ name: '*' })`. See
  [§7](#7-the-mcp-team-directory).

**Conditional card rendering is rejected.** Having `createTask` render a card only when the user asks
for one is a few lines, but it makes the beat hinge on the model inferring a boolean from "with a
visual confirmation", and the failure is silent: plain text, no card, no recovery but retyping.
Every other beat fails loudly or not at all.

### `maxSteps`

The runtime default is **1**, which lets the model emit a tool call and never see the result
([#4](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/4)). Every tool-using beat
needs it raised.

**Set `maxSteps: 5`.** Beat 6 needs at least 3, and that figure is exact rather than conservative: a
frontend tool result returns into the *same* run, so the directory lookup, the assign, and the reply
are three model calls in one run
([#14](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/14)). Below 3 the agent
assigns and then says nothing. 5 leaves headroom for an ad-lib without changing behaviour on any
pinned prompt.

---

## 5. Repo layout and tooling

Settled in [#10](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/10), amended there
after [#9](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/9), extended by
[#13](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/13).

One pnpm workspace, five members.

```
copilotkit-demo/
  app/          Angular 22, standalone, zoneless
  runtime/      Node CopilotRuntime, tsx off source
  mcp/          stdio MCP team-directory server, tsx off source
  agent/        file-based C# app (agent.cs)
  slides/       Slidev deck
  docs/         demo-spec.md, runsheet.md
  .env          git-ignored, OPENAI_API_KEY only
  .env.example
  pnpm-workspace.yaml
  README.md
```

`pnpm-workspace.yaml` lists the five folders **explicitly**, not by a `*` glob. Three of them are
Node and share one root lockfile. `agent/` is a .NET project that joins the workspace only to carry
a script.

**Every version is pinned exactly, no ranges, through pnpm's default catalog.** `@copilotkit/angular`
is pinned to `0.3.1`. `@angular/cdk` must match Angular's major, which is the most common install
failure. Note that `ng new` and `ng add` write caret ranges and know nothing about catalogs, so the
order is: scaffold first, then hoist every version into the catalog by hand.

**Package names are bare**: `app`, `runtime`, `mcp`, `agent`, `slides`. Nothing is published, and
`--parallel` prefixes output with the package name, so `app | runtime | mcp | agent` streams onto the
projector and reads as the architecture diagram. Seven characters of `@demo/` scope in front of each
one reads as noise from the back row.

### Scripts and ports

| package | `dev` | port |
|---|---|---|
| `app` | `ng serve` | 4200 |
| `runtime` | `tsx watch src/main.ts` | 8200 |
| `mcp` | *(none, the runtime spawns it)* | n/a |
| `agent` | `dotnet run agent.cs` | 8888 |
| `slides` | *(none, its script is `present`)* | 3030 |

Root `package.json` carries `"dev": "pnpm run -r --parallel --if-present dev"`, so you type
`pnpm dev`.

`--parallel` is required rather than stylistic. pnpm's own help calls it the preferred flag for
long-running processes, and plain `-r run` sorts topologically and blocks on whichever server starts
first. `-r` does not match the workspace root, so there is no recursion. `--if-present` is what keeps
`mcp` and `slides` out of the stream, holding the projected output at four names.

`agent/package.json` is exactly `{"name": "agent", "private": true, "scripts": {"dev": "dotnet run agent.cs"}}`.
No `version`, no dependencies, so it never touches the catalog. It makes the .NET project a
first-class member of the run story without pretending it is a Node project.

**`pnpm dev` is a phase-1 command.** [#10](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/10)
originally claimed it meant something different on each branch. That stopped being true once
[#9](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/9) put all four folders on both
branches, and [#17](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/17) retired the
claim. Phase 2's pre-flight is a different and uglier line, typed once from the Runsheet.

### No build step

`runtime/` and `mcp/` run under `tsx` straight off source. No `dist/`. This removes a step from
pre-flight, and it means the file open on a slide is the file that is running, with no "this is the
source, the compiled output is elsewhere" caveat during a read-through. `tsc` stays installed for
type-checking and never emits.

Ports are hard-coded in code, with no env indirection. `--port` on the phase-2 dev server is the one
exception, and it is a flag on a process that is never projected
([#17](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/17)).

`slides/` puts a build step in a repo whose whole aesthetic is "no build step". That is a deliberate
exception, taken because the deck is the one artifact that is not the demo.

### Crossing the origin

Angular uses an **absolute** `runtimeUrl` of `http://localhost:8200/api/copilotkit`, and the runtime
sets `cors: true`. **No dev-server proxy.** The reason is phase 2, not convenience: phase 2 points
the browser at a different origin with no runtime in the path at all, so a proxy would be phase-1
scaffolding the phase-2 branch has to delete. Absolute URLs make Angular's side structurally
identical across the two phases, which is the claim beat 7 rests on.

### The key, and a hole that would have failed on stage

One `.env` at the repo root, git-ignored, containing `OPENAI_API_KEY` and nothing else, with a
`.env.example` beside it.

A root `.env` is a Node idiom that nothing reads automatically, and **`dotnet run agent.cs` would
have seen the key as unset**. That failure shows up only on the phase-2 branch, which is the worst
possible place for it. So both sides load it explicitly:

- `runtime/src/main.ts` calls `process.loadEnvFile('../.env')`. One line, no dependency, no CLI flag,
  so it survives whatever `tsx` does or does not forward to node.
- `agent.cs` calls `Env.Load("../.env")` from `DotNetEnv`, pinned inline with a `#:package` line.

Telling people to `export` the variable in their shell was rejected as exactly the invisible
prerequisite that kills a demo.

**`OPENAI_MODEL` stays out of `.env`.** The model is pinned in code, twice:

- runtime: `model: "openai/gpt-5-mini"` (the form smoke-tested in
  [#4](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/4), and the one matching the
  typed union)
- agent: `"gpt-5-mini"` on the OpenAI client

They must match. Beat 7 re-runs two prompts the room saw twenty minutes earlier, so latency is part
of the demo, and a model mismatch reads as "the .NET one is slower" rather than as a bug.

### Angular scaffolding

Angular **22**, standalone, **zoneless**, SSR off, plain CSS, `--skip-tests`. Node **24**.

Peer ranges accept Angular 20, 21, or 22 and all three are in CopilotKit's tested matrix
([#2](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/2)); the quickstart says
Angular 22 and Node 22. Node 24 is the machine the talk runs on, and pinning down is a fabricated
risk.

Two things only whoever clones the repo afterwards will hit, neither exercised during the talk:

- Production budget raised to `4mb` warning / `5mb` error in `angular.json`. CopilotKit's markdown
  and highlighting dependencies blow Angular's 1 MB default; the measured initial bundle with the
  chat wired up is 3.79 MB raw, 1.36 MB transferred, so the `2mb`/`3mb` first guess did not hold.
- The chat host needs an explicit height in its component styles or it collapses.

Styling is Angular defaults plus CopilotKit's stylesheet. Nothing custom.

### Branches

**`main` is phase 1 and stays the repo default. Phase 2 is `phase-2`**, forked from `main`.

`phase-2-maf` was rejected against `CONTEXT.md`, which says phases are never named after their
stacks, and the branch name is on screen during beat 7. Symmetric `phase-1` / `phase-2` was weighed
and rejected because a clone should land on the talk's main line.

### README

One root README, no per-folder ones. Its reader is a Satellit .NET dev who saw the talk. It carries:

- what the demo is
- the two-branch map
- prerequisites: Node 24, pnpm, .NET 10, an OpenAI key
- the run story per phase
- **running both phases at once**: the second worktree, port 4300, and why the agent starts only
  once. A reader who wants to reproduce beat 7 hits this exact collision.
- a short "what to look at" list pointing at the four or five files that matter

Not the beats and not the prompts. Those live here and, if the audience should have them, in the
deck.

---

## 6. Phase 1 architecture

Browser (Angular 4200) -> Node runtime (8200) -> OpenAI. The runtime spawns the MCP server as a
stdio child.

### The runtime

```ts
import { createCopilotNodeListener } from '@copilotkit/runtime/v2/node';
```

Straight into `createServer`, with `{ runtime, basePath, cors: true }`. **Use the `v2` entrypoints.**
The older self-hosting docs' `copilotRuntimeNodeHttpEndpoint` + `serviceAdapter` API has no
`BuiltInAgent` ([#4](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/4)).

`BuiltInAgent` config: `model: "openai/gpt-5-mini"`, the system prompt in the `prompt` field,
`maxSteps: 5`, and `mcpClients` (see below). The runtime calls `createOpenAI` from `@ai-sdk/openai`
directly and reads `OPENAI_API_KEY`.

**No backend tools.** All five Board tools are frontend tools. `tools[]` stays empty, which is what
makes phase 2 a config swap rather than a port.

### Angular

Provider setup is `provideCopilotKit({ runtimeUrl: 'http://localhost:8200/api/copilotkit' })`, and
the chat is `<copilot-chat />`. That pair is the whole frontend wiring, and it is slide 2.

Symbol map, verified against the shipped `dist/index.d.ts` at `0.3.1`
([#2](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/2)):

| need | Angular API |
|---|---|
| chat | `<copilot-chat>` (also `CopilotPopup`, `CopilotSidebar`) |
| agent reads state | `connectAgentContext()` or `[copilotkitAgentContext]` |
| frontend tools | `registerFrontendTool()` |
| component in chat | `component:` on `registerFrontendTool()` |
| render a tool the app did not define | `registerRenderToolCall()` |
| shared state | `injectAgentStore()` (**not used**, see §3) |

All the `inject*` and `register*` helpers tie themselves to the owning `DestroyRef`, so cleanup is
automatic.

**`injectCapabilities` is documented but does not ship in 0.3.1.** It appears zero times in both the
shipped `.d.ts` and the `.mjs` bundle. Plan nothing around runtime capability detection.

The package is a first-party signal-based port with roughly 1:1 parity, MIT, bundling
`@copilotkit/core` 1.66.0. It is also two months old with 25 versions and three minors in that
window, which is why the exact version is pinned. CopilotKit's own docs-status page says the Angular
frontend is feature-complete but the docs are still catching up, and points at the React docs as the
complete feature map. That is accurate. Translate React snippets through the Angular reference, and
remember `component:` where React has `render`.

---

## 7. The MCP team directory

Settled in [#8](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/8). Phase 1 only.

**The beat proves itself by returning a name the Board has never seen.** The lookup surfaces **Ines**,
who appears in none of the eight Seed Tasks, and chains straight into `assignTask` on T-2.

The rejected shapes make the reason concrete. If the directory answered Chloé, she already holds T-2
and the beat is a visible no-op. If it answered another cast member, the room cannot tell whether the
agent read the directory or picked a name off the board it was already holding. A name that exists
in exactly one place, behind the MCP server, is the only version that is legible from the back of the
room.

Worth saying aloud on stage: Chloé holds T-2 and Chloé is Frontend. The directory does not only
supply a name, it reveals the spreadsheet import is on the wrong person, so the reassign reads as a
correction rather than an arbitrary move.

### The roster

`mcp/directory.json`. A visible file, because "this process owns data your app has never seen" is
more literal as a file than as a hardcoded array.

| name | team | skills |
|---|---|---|
| Amira | Product Design | product design, UX writing |
| Bruno | Platform | infrastructure, CI/CD, deployments |
| Chloé | Frontend | Angular, design systems |
| Dries | Security | identity, SSO, access reviews |
| **Ines** | **Data Platform** | **data pipelines, ETL, systems integration** |
| Youssef | Legal & Procurement | vendor contracts, purchasing |

First names only. The Seed's assignees are bare first names, and an `Ines Rahman` sitting in a column
of `Amira` and `Bruno` is exactly the small wrongness that pulls attention off the point. Youssef
exists so the non-matches are not all cast members, and six entries make the search look like a
search rather than a staged table.

### Tools

Two, **snake_case**.

- `find_teammates(skill: string)`. Case-insensitive substring match over the free-text skills string.
  Returns an **empty list** when nothing matches, and **never throws**. A thrown error mid-beat is an
  unrecoverable stage moment; an empty list lets the model say "nobody matches" and you move on.
- `list_team()`. Everyone. The pinned prompt does not need it. It earns its place because it means
  the agent visibly *chose* between two tools, and it gives you a cheap ad-lib ("who's in the
  directory?") to show the source data before the real prompt, which matters when Ines is the
  punchline.

**The matching gap is closed in the data, not in the server.** The prompt says *data* and
*integration*; Ines's record says *data pipelines, ETL, systems integration*. Whether the model calls
`find_teammates("data")`, `find_teammates("integration")`, or both, Ines is the only hit every time.
Fuzzy or semantic matching is rejected as non-deterministic on stage, and nothing about this beat
improves by the server being clever. The point is the protocol, not the search.

**snake_case is deliberate and must not be "fixed" later.** When the transcript shows
`find_teammates` next to `assignTask` in the same turn, the naming difference is a free visual cue
that these came from two different places.

### Wiring

TypeScript stdio server on `@modelcontextprotocol/sdk`, run via `tsx`, **spawned by the runtime as a
child process at startup**: `Experimental_StdioMCPTransport` from `@ai-sdk/mcp/mcp-stdio`, wrapped in
a caching `MCPClientProvider`, attached via **`mcpClients`**.

`mcpClients`, not `mcpServers`, and this is not a preference
([#4](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/4)):

| option | transports | connection owner |
|---|---|---|
| `mcpServers` | `http` and `sse` only | the runtime |
| `mcpClients` | anything, stdio included | you |

`mcpServers` is URL-only. Its shipped type union is literally `MCPClientConfigHTTP | MCPClientConfigSSE`,
and the runtime's transport construction has exactly two branches. An unrecognised `type` leaves
`transport` undefined and the server is **silently skipped**, with no error. `mcpClients` takes
`MCPClientProvider`, a structural interface with one method, `tools(): Promise<ToolSet>`. The runtime
never inspects the transport. Cache the result, because `.tools()` is called on every agent run.
Runtime-level `mcpApps` reuses the same `MCPClientConfig`, so it is not a way around the limit.

`mcp/` is a **top-level folder**, not a subfolder of `runtime/`. On the architecture slide it is not
part of the runtime, and burying it there tells the wrong story to a room being taught what MCP is.
Auto-spawned rather than hand-started, because a manual process is one more thing to forget at 09:00.

**TypeScript, not C#, and this was close.** A C# stdio server is attractive for this audience and the
first-party SDK exists. It loses because phase 1's architecture slide says "Node runtime, and phase 2
deletes it", and a second .NET process in phase 1 muddies the one diagram the talk's argument rests
on. The C# read-through happens in beat 7, where it is load-bearing.

### Discovery and rendering

**Nothing about the directory goes in the system prompt.** Tool descriptions being sufficient *is* the
mechanism the beat teaches, and the pinned prompt already carries the cue in the words "the team
directory". A system-prompt hint would make the beat work for a reason the audience cannot observe.

MCP calls render through the wildcard `registerRenderToolCall({ name: '*' })`, confirmed present in
the Angular bundle and sitting below every named registration in the precedence chain, so it will not
shadow the Task card or the mini board. Render it as a deliberately plain, **always-expanded** panel:
tool name, arguments, raw result. No purpose-built Teammate card. Beat 5 showed a tool the app
designed UI for; beat 6 shows a tool the app had never heard of, and a pretty card would erase the
exact distinction.

### Phase 2

MCP is runtime-only, so on `phase-2` the Node tier and `mcpClients` go together and beat 6 does not
exist there. Beat 7 only re-runs beats 3 and 5, so nothing breaks.

**The `mcp/` folder stays on `phase-2`, unwired**, and the architecture slide pre-empts the question
in one sentence: MCP does not disappear with the Node tier, it moves, because MAF has first-class MCP
support in .NET. Wiring MAF to MCP is out of scope.

Note that on `phase-2` the runtime is still byte-identical and, if started, would still spawn the MCP
server. In practice the phase-2 worktree starts only Angular, so it does not
([§12](#12-the-runsheet-docsrunsheetmd)).

---

## 8. Phase 2: the MAF agent

Settled in [#9](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/9), with a mandatory
fix from [#15](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/15).

Browser (Angular 4300) -> C# MAF agent (8888) -> OpenAI. No Node tier.

### `agent/agent.cs`

A **file-based C# app** (`dotnet run agent.cs`), .NET 10, single file, top-level statements, no
`.csproj`. `#:sdk Microsoft.NET.Sdk.Web` gives Minimal APIs, and `#:package Name@version` pins exact
versions inline, which means the `--prerelease` flag disappears from the run story entirely.
`dotnet project convert agent.cs` is the answer to "but is this a real project?", which this audience
will ask.

**About 105 lines, and it was specced at 31.** The one-screen read-through this section originally
promised is gone, and the reason is the second workaround in
[The continuation fix](#the-continuation-fix-and-why-it-is-not-optional-either), found by playing
beat 7 rather than by reading anything. What survives is the shape: the wiring is still one screen,
the two workarounds sit under it, and each is its own slide with its own reason. Do not try to win
the line count back by deleting either of them.

Contents:

- `#:package Microsoft.Agents.AI.Hosting.AGUI.AspNetCore@1.19.0-preview.260822.1`,
  `#:package Microsoft.Agents.AI.OpenAI@1.19.0` — the GA half, for the OpenAI client and
  `AsAIAgent` — and `#:package DotNetEnv@<pinned>`.
- `Env.Load("../.env")`.
- `builder.WebHost.UseUrls("http://localhost:8888")`. Learn passes the port as `--urls` on the
  command line. Putting it in the file keeps the run command at exactly `dotnet run agent.cs` with no
  flags, which is the line that goes in the README and on the slide.
- **CORS as a one-liner**: `AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()`. The browser is now
  the direct client, so this is required. A named policy would imply a security posture this topology
  does not have; the honest framing lives on the architecture slide instead.
- `AddAGUIServer()` and `MapAGUIServer("/", agent)`, the first-party adapter.
- `chatClient.AsAIAgent(name, instructions)` with **no backend tools**, then the context-folding
  middleware below, then `.Build()`.
- The key is the same `OPENAI_API_KEY`, read via `builder.Configuration["OPENAI_API_KEY"]`. ASP.NET
  picks env vars up with no wiring. `dotnet user-secrets` is the better real-world answer and gets a
  slide line, not the demo.

Endpoint is `http://localhost:8888/`, mapped at `/`. Same numbers as every Microsoft sample, so
anyone who goes home and opens `dotnet/samples/02-agents/AGUI` sees what they saw here.

**The system prompt is copy-pasted verbatim** from phase 1's `BuiltInAgent` into the C#, with no
shared-file mechanism. A `prompt.md` both tiers read is the right engineering answer and the wrong
demo answer, since it adds a mechanism to explain that is not part of the story. The slide says: same
prompt, the other language.

**No backend tools.** Adding a C# tool would make phase 2 behave differently from phase 1, which
destroys the beat's claim. `AIFunctionFactory.Create` appears as one line on slide 18 labelled "what
you'd add next", never in the running agent.

### The context fix, and why it is not optional

`MapAGUIServer` reads `messages`, `tools` and `resume`. **It drops `context`.**

Verified twice in [#15](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/15): by
source trace, and by running the real published preview package against a fake `IChatClient`. The
board marker never arrived. `agent.cs` as originally specced would have failed beat 7 live, on the
prompt that resolves "the profile page" to T-4.

`MapAGUIServer` calls `input.ToChatRequestContext(...)` and passes only `ctx.Messages` and
`ctx.ChatOptions` to the agent. `ToChatRequestContext` reads `input.Messages`, `input.Tools` and
`input.Resume`. `Context`, `State` and `ForwardedProperties` are not read; the whole input is stashed
on `ChatOptions.AdditionalProperties[agui_input]` for the app to recover via `TryGetRunAgentInput`.
The framework says in a doc comment that this is your job.

The fix is about 11 lines, no new package reference, and no class, since `AIAgentBuilder` has an
anonymous middleware overload. It goes between `AsAIAgent(...)` and `MapAGUIServer(...)`. Keep it as
its own `.Use(...)`: the second workaround below is a second one, so that each is a single idea on a
slide.

```csharp
.AsBuilder()
.Use(async (messages, session, options, next, ct) =>
{
    if (options is ChatClientAgentRunOptions { ChatOptions: { } chatOptions }
        && chatOptions.TryGetRunAgentInput(out RunAgentInput? input)
        && input.Context is { Count: > 0 } entries)
    {
        var text = string.Join("\n\n", entries.Select(e => $"{e.Description}:\n{e.Value}"));
        messages = [new ChatMessage(ChatRole.System, text), .. messages];
    }
    await next(messages, session, options, ct);
})
.Build();
```

Two `using` lines, both transitive, confirmed by building it. Verified working against the same probe:
the board arrives as a system message ahead of the user turn.

**Sending the board as a chat message from Angular instead is rejected.** It would change phase 1,
which is not broken; it unpicks §3's single `connectAgentContext()` entry and replaces it with
hand-managed injection bookkeeping; and it costs a slide, since `connectAgentContext()` is beat 2's
answer to how the agent reads the app. It is not even fewer lines.

**Beat 7's read-through gains from this.** Phase 1 was never doing nothing here: the Node
`BuiltInAgent` folds context into the system prompt every turn, invisibly, inside a dependency. The
lambda is that same step made visible. "Here is the one thing the Node tier was doing for you, in
eleven lines of C#" plays better to a mostly-.NET room than "look, no code". Slide 17 zooms it.

**Pin the AG-UI package version exactly.** This is undocumented behaviour, so a future preview could
start folding context in automatically and double the board in the prompt.

### The continuation fix, and why it is not optional either

Settled in [#29](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/29), by playing the
beat. Nothing in the research predicted it and nothing in the docs describes it.

**Once a turn has run a frontend tool, `AGUI.Server` 0.0.5 reads every later turn in that thread as a
continuation.** `ToChatRequestContext` sees a completed tool call and its result in the history and
takes the resume path, which re-declares the tools the model has *not* called as bare
`AIFunctionDeclaration`s rather than approval-required functions. A declaration is not invocable, so
`FunctionInvokingChatClient` never stops on it, and the continuation branch of the event mapping
swallows the plain `FunctionCallContent` instead of emitting `TOOL_CALL`. The run finishes
successfully and emits nothing at all.

Live, that is beat 7 answering its first prompt and then going dead on its second — the two prompts
are one thread in one tab, and the second is the one that renders the Task card.

**0.0.6 fixes it upstream and cannot be taken.** It writes explicit JSON nulls where the pinned
`@ag-ui/client` 0.0.57 — the version `@copilotkit/angular` 0.3.1 depends on exactly — declares the
field `optional()`, so its zod parse rejects `RUN_STARTED` and every turn dies rather than the second
one. Bumping the client is not available either: it is a transitive pin of the Angular package, and
phase 1 must not change. The same bug is present in 0.0.3, so going back is not a route out.

So `agent.cs` does what 0.0.6 does, in a second `.Use(...)`: walk `ChatOptions.Tools`, and re-present
each bare declaration as `new ApprovalRequiredAIFunction(new FrontendTool(declaration))`. This costs
the one class the original spec was proud not to need — `FrontendTool`, which forwards name,
description and schema to the declaration and throws from `InvokeCoreAsync`, unreachable because
approval terminates the run first. `AIFunctionFactory` cannot stand in for it: no overload takes an
explicit JSON schema, and the schema is exactly what has to survive.

**This is the reason the version pins are exact, restated with teeth.** Two package versions are now
load-bearing in opposite directions and the demo sits between them.

### Packages and where the protocol lives

Core MAF .NET is GA (`Microsoft.Agents.AI` 1.19.0 stable). The AG-UI hosting package is **preview
only**, `1.19.0-preview.260822.1`, with zero stable releases ever.

The AG-UI protocol has moved out of MAF into the AG-UI team's C# SDK (`AGUI.Abstractions` +
`AGUI.Server`); MAF keeps the ASP.NET glue. This is not a "main has moved on" hazard: the published
`1.19.0-preview.260822.1` nuspec already depends on `AGUI.Server 0.0.5`.

Angular side is `@copilotkit/angular` 0.3.1 and `@ag-ui/client` (pin whatever `0.0.5x` the lockfile
resolves at build time; 0.0.57 and 0.0.58 were both seen during research).

### Frontend tools survive the swap

They ride `RunAgentInput.tools`, an AG-UI **protocol** field, not a CopilotKit runtime feature, so
removing the runtime changes nothing. The `TOOL_CALL_START` / `ARGS` -> `handler(args)` ->
`TOOL_CALL_RESULT` loop runs entirely between browser and agent. Server side needs zero extra code:
Microsoft's `Step03_FrontendTools` sample `Program.cs` is identical to the getting-started one.

One footgun: use `copilotkit.runAgent({ agent })`, never `agent.runAgent()`. The latter silently drops
registered tools.

### The security caveat

Microsoft's AG-UI security guidance says plainly: do not expose AG-UI servers directly to untrusted
clients such as JavaScript running in browsers. That is exactly what `selfManagedAgents` does. A
browser that can POST arbitrary `RunAgentInput` can inject system messages, forge tool results, and
declare tools whose *descriptions* instruct the model. CopilotKit agrees with the diagnosis; the React
alias for the prop is literally `agents__unsafe_dev_only`.

No model key reaches the browser. `HttpAgent({ url })` carries a URL, not a credential. Anything in
`HttpAgent.headers` *is* user-visible, so it must be a per-user token and never a shared secret.

For a local demo this is the right shape. The spec's obligation is that it gets said, once, on slide
14, in the same breath as the fix. See [§9](#9-the-branch-diff).

### Licensing

`selfManagedAgents` is documented as an Enterprise tier feature. **The gate is a commercial term, not
a code path** ([#12](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/12)).
CopilotKit's own source calls the signal advisory and client-side only. `checkFeature` fails open, the
watermark ships hard-disabled, there is no licence server or phone-home, every package is MIT, and in
`@copilotkit/angular@0.3.1` there is not even a warning. An unlicensed local machine hits zero limits.

Two riders. The threads drawer *is* genuinely gated and hangs in `licensePending` under
`selfManagedAgents`, so it is never mounted (§2). And the commercial obligation for production use is
real regardless of the missing technical gate, which is why licensing gets a section on slide 18.

---

## 9. The branch diff

**`app/`, `runtime/`, `mcp/`, `agent/` and `slides/` all exist on both branches.** `main` is phase 1;
`phase-2` forks from it. Phase 1 never routes to `agent/`. Phase 2 never routes to `runtime/` or
`mcp/`.

The consequence is that `git diff main phase-2` is **one file**, `app/src/app/app.config.ts`, swapping

```ts
runtimeUrl: 'http://localhost:8200/api/copilotkit'
```

for

```ts
selfManagedAgents: { default: new HttpAgent({ url: 'http://localhost:8888/' }) }
```

plus the `@ag-ui/client` import. Six lines.

The alternative, `agent/` existing only on `phase-2`, is more honest about what phase 2 *adds*, but it
buries the one line carrying the architectural point inside a whole new folder. The C# read-through
carries that weight on its own.

**The diff goes on a slide, pasted at full size.** Not `git diff` in a terminal (small, scrolls,
colour-coded for a theme you may not be on) and not the editor's diff view.

**Say the folders are still there.** One clause: "`runtime/` is still in the repo, nothing is calling
it." Someone will notice, and admitting it costs less than hiding it. Slide 15 extends the same clause
to the deck: every folder is still there, including the slides, so it is a talk about a repo that
contains its own talk.

**`phase-2` must be rebased onto `main` once the deck is final.** `phase-2` inherits `slides/`, and
every slide edit made after the fork lands in that diff. Slide edits are the thing most likely to
still be happening the night before. Showing
`git diff main phase-2 -- app/src/app/app.config.ts` instead was rejected: it narrows the claim from
*one file changed* to *one file I chose to show you*, and this room reads diffs for a living.

**An env-var toggle between `runtimeUrl` and `selfManagedAgents` in one checkout is rejected.** It
would remove the branch diff that is the centrepiece. The fork is the slide, so it has to be a real
fork.

### The live switch

A **second git worktree** at `../copilotkit-demo-phase2` on `phase-2`, with its Angular dev server
already running on 4300. The switch on stage is a **browser tab change**.

The phase-2 tab is a different origin, so it has never seen beats 1 to 6. The Board there is already
the Seed with no scrollback, which is exactly what the Reset was for. **So beat 7 does not press
Reset.** Pressing a button that visibly changes nothing, at the emotional peak of the talk, is a dead
beat.

---

## 10. The beats

Seven beats, roughly 65 minutes, no hard cap
([#7](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/7)). One Seed carries all of
them.

| block | target |
|---|---|
| Beat 1, cold | ~4 min |
| Opener: agents, tool-calling, AG-UI, CopilotKit | ~13 min |
| Beats 2 to 6 | ~23 min |
| Architecture slide + beat 7 | ~14 min |
| Q&A | ~9 min |

**These are targets, not a budget.** Running 5 to 10 minutes long is acceptable, and **nothing is
designated as the drop-if-long beat**. Overrun is absorbed by Q&A.

Deck and app interleave: a slide names the capability, the beat demonstrates it. Two exceptions. Beat
1 runs *before* the opener, so the room sees the thing move before it gets 13 minutes of vocabulary.
And the phase-2 architecture slide is a real 2 to 3 minute diagram, because that fork is the talk's
argument.

### Beat 1: there is a chat, and it is cheap

> **"What usually goes wrong when a company builds its own employee onboarding portal?"**

Deliberately **off-board**. The answer is just the model, with no knowledge of the app, which is the
setup for beat 2's reveal.

Then slide 2 shows two things only: the `<copilot-chat />` template line and the provider
`runtimeUrl` setup. The Node runtime is **not** shown here. Its narrative job is to disappear in phase
2, so it is introduced on the architecture slide and removed in the same breath.

This turn is also the source of trace 1 (§11).

### Beat 2: the agent reads the Board

> **"What's Bruno working on, and is anything not assigned to anyone yet?"**

Two Tasks share Bruno and exactly one todo is unassigned, so a correct answer proves the agent read
all eight rows and two different fields.

### Beat 3: mutating tools

Three prompts, three turns, about four minutes.

1. > **"Amira finished the profile page — mark it done."**
   `moveTask`, with the model resolving title to id.
2. > **"Put Dries on picking an SSO provider."**
   `assignTask`, grabbing the deliberately-unassigned T-3.
3. > **"Actually, drop the domain registration task."**
   `deleteTask`, then the confirm dialog.

Human-in-the-loop is the second half of prompt 3, not a beat of its own. The delete target is T-7,
chosen because it is `done` and inert.

### Beat 4: the model resolves words, and can resolve them wrong

> **"Put Bruno's task in done."**

Bruno holds exactly two Tasks, so the request is genuinely ambiguous and the agent must ask which. You
answer, and it moves T-5.

This turns "what does failure look like on stage" from a risk into a planned moment. For a room that
has never built an agent app, "this is not a function call, it resolves your words against context" is
among the most useful things they leave with, and demonstrating it on purpose beats it happening by
accident during beat 6.

The wording matters. "Mark the onboarding task done" was the first draft, but every Task on the board
is an onboarding task, so the ambiguity is seven-way and the agent may simply pick one. "Bruno's task"
is ambiguous over exactly two.

**This beat's success criterion is the model declining to act.** That is a model behaviour, not a code
path, so it cannot be asserted in a test, only measured in rehearsal (§12).

### Beat 5: a tool can return UI

1. > **"Add a task to book the training room for the induction day"**
   `createTask`, whose result renders as a Task card in the transcript. Creates T-9.
2. > **"Show me the board"**
   `showBoard`, rendering a mini three-column board.

`createTask` moved out of beat 3 to headline here, so beat 5 has a two-prompt arc and beat 3 keeps a
clean shape ending on the confirm.

### Beat 6: MCP team directory

> **"Who in the team directory has done data or integration work? Put them on the HR spreadsheet import."**

A directory lookup chained into `assignTask`, targeting T-2, which nothing before it touches. The
answer is Ines.

This is the only beat that chains two tool calls in a single turn, and it needs `maxSteps >= 3` (§4).

### Beat 7: phase 2

Switch to the 4300 tab. No Reset. Then two prompts, both verbatim re-runs:

1. > **"Amira finished the profile page — mark it done."**
2. > **"Add a task to book the training room for the induction day"**

Live, and deliberately anticlimactic: identical behaviour while the slide shows the Node tier gone.
The payoff is sameness.

**Two prompts rather than one** because the claim phase 2 makes is that frontend tools are untouched.
One call is an anecdote, two is a pattern, and the second renders UI, which is what looks most likely
to break across a backend swap.

Order within the 14 minutes: **architecture slide, then C# read-through, then the two live prompts.**
This room judges the talk on whether the .NET looks like code they would write, so they read it before
they see it run. The two prompts then land as confirmation of something already understood, and the
anticlimax sits at the end, where it belongs, as the point.

### Board state through the talk

No resets between beats 1 and 6. Five resets manufacture exactly the continuity break the Reset button
exists to prevent. The cost is that each beat must reach only for Tasks earlier beats left alone, and
the order above is built to that constraint.

| after | Board |
|---|---|
| beat 3 | T-4 `done`, T-3 assigned to Dries, T-7 deleted |
| beat 4 | T-5 `done` |
| beat 5 | T-9 *Book the training room for the induction day* created |
| beat 6 | T-2 assigned to Ines |
| beat 7 | fresh Seed, because it is a different origin |

A useful side effect, noticed after the fact: **every remaining beat's target still exists in the
Seed**, so a mid-talk Reset costs you the visible history of what already ran and nothing else. Beat 4
wants T-5, beat 5 creates T-9, beat 6 wants T-2, all present or irrelevant after a restore. Reset is
safe at any moment.

### The prompt-design rule

**Never write an on-stage prompt that mutates the Board and asks a Board-derived question in the same
turn.** The agent will answer confidently from the pre-mutation Board.

Every prompt above already obeys this. The rule exists so a later edit does not break it by accident.
See [§13](#13-known-behaviours-and-constraints) for why.

---

## 11. The deck

Settled in [#13](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/13).

Slidev project in `slides/`, a workspace member whose script is `present`, not `dev`. Default theme,
no customisation. Port 3030. English, matching the app, the pinned prompts, `CONTEXT.md` and every
link pointed at.

`slidev export` produces `slides/deck.pdf`, committed. This is the deck's only fallback, and it is not
a violation of the map's light-resilience stance: that stance was about the demo, where a fallback
means faking the thing you claim to be demonstrating. A PDF of your own slides is just your slides.

**The deck is never iframed into the app and the app is never embedded in the deck.** Tabs are the one
motion all hour. An iframed app that fails to load is a broken slide and a broken demo at once.

**The editor is never projected.** All code is on slides, including beat 1's wiring and the C#
read-through. An editor at presentation font size fits fewer lines than a slide with worse contrast.
The "it's a real file in a real app" reassurance is carried by the QR to the repo on slide 19.

### The two traces

The opener is trace-first. Beat 1 has just run cold, so the room derives vocabulary from something
concrete instead of being handed definitions to hold. But beat 1 is off-board, so its trace cannot
demonstrate tool-calling. Hence two.

- **Trace 1 is real**, captured from beat 1: system prompt, user message, model reply. Its annotation
  is what is *missing*. Nothing here knows about your app.
- **Trace 2 is hand-built**, showing beat 3's first turn: system, board context, the `moveTask` call,
  the tool result, the final message. Four annotated parts and nothing else. Hand-built beats a real
  capture, which carries token counts, ids and framing noise you then have to apologise for.

The room reads the trace before watching beat 3 produce it, the same read-then-run move phase 2 uses.

**Both traces are in Responses-API vocabulary.** `@ai-sdk/openai`'s default model constructor is the
Responses API, so a real capture shows `input`, `function_call` and `function_call_output`, not
`messages` and `tool_calls` ([#14](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/14)).
Trace 2 must match, or the two slides will not read as the same system.

Capture trace 1 with a **throwaway `console.log`** in `runtime/src/main.ts`, run once, then delete it.
Not a debug flag and not an env-gated logger. Nothing about producing a slide asset should survive
into a repo people clone.

### The outline

Nineteen slides.

| # | slide | block |
|---|---|---|
| 1 | Title, up while beat 1 is typed | cold open, ~4 min |
| 2 | Code: `<copilot-chat />` + the provider `runtimeUrl`, the whole frontend so far | |
| 3 | Where we're going: the phase-1 / phase-2 fork | |
| 4 | Trace 1, real, beat 1's turn. *Nothing here knows about your app* | opener, ~13 min |
| 5 | Agent = model + loop + your app's context, defined against trace 1's gaps | |
| 6 | Trace 2, hand-built, beat 3's turn | |
| 7 | Tool-calling defined: the model requests, your code runs, the loop feeds the result back. `maxSteps` lands here | |
| 8 | CopilotKit named: chat UI + runtime + protocol. `@copilotkit/angular` pinned. AG-UI named, defined at slide 14 | |
| 9 | Beat 2, "the agent reads the Board" + `connectAgentContext()`, accessor not object. Carries the one-line shared-state mention | beats 2 to 6, ~23 min |
| 10 | Beat 3, "the agent changes the Board" + `registerFrontendTool()`, with the confirm variant | |
| 11 | Beat 4, "it resolves your words, and it can be wrong" (title card) | |
| 12 | Beat 5, "a tool can return UI" + `component:`. Mutating tool vs rendering tool | |
| 13 | Beat 6, "reaching outside the app: MCP" (title card) | |
| 14 | Architecture, three builds on one slide: Node tier present, gone, back in front in production. AG-UI defined here. Carries the browser-direct caveat and *MCP moves to MAF* | phase 2, ~14 min |
| 15 | The diff: six lines of `app.config.ts` at full size, plus the folders-are-still-there clause | |
| 16 | `agent.cs` in full (~31 lines) | |
| 17 | The context-folding lambda zoomed (~11 lines): the step phase 1's Node agent was doing invisibly | |
| 18 | Taking this further: `AIFunctionFactory.Create`, `user-secrets`, licensing, MCP into MAF | close |
| 19 | Resources: QR to the repo, CopilotKit Angular docs, Microsoft's AG-UI sample, the `dotnet run app.cs` announcement | |

Slides 9 to 13 split by whether a new Angular API appears. Beats 2, 3 and 5 each introduce one whose
code is three lines, so the code is on the slide, because this room's recurring question is "yes, but
what did *you* write". Beats 4 and 6 introduce no new Angular API, so they stay title cards.

**Architecture is one slide with three builds, not three slides.** Builds keep the boxes in fixed
positions, so the Node tier visibly vanishes rather than the picture being redrawn. That is the one
thing the slide must land.

Structural choices worth not relitigating:

- **No agenda slide before beat 1.** An agenda before anything has happened is words about words.
  Slide 3 does the same job after the room has seen the app move.
- **Licensing is a section of slide 18, not its own slide.** The implicit question in an internal room
  is "could we use this here", so it gets answered, but a standalone slide about commercial terms
  overstates it.
- **Shared state is one line on slide 9**, not on the closing slide. It is a fact about the API on
  screen at that moment, not a next step.
- **No "what this isn't" slide.** The out-of-scope list reads as apologising for a demo everyone knows
  is a demo, and the one out-of-scope item with teeth, browser-direct AG-UI, already does real work as
  a sentence on slide 14.

---

## 12. The Runsheet (`docs/runsheet.md`)

Settled in [#17](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/17). This is a
deliverable of the build, committed alongside the spec.

### Five processes

The phase-2 worktree does not run `pnpm dev`. `agent/`, `runtime/` and `mcp/` are byte-identical on
both branches, so starting them twice would only fail to bind 8200 and 8888. `app/` is the only
package that genuinely needs two instances.

| worktree | command | processes |
|---|---|---|
| `copilotkit-demo` (`main`) | `pnpm dev` | `app` 4200, `runtime` 8200 (spawning `mcp` as a stdio child), `agent` 8888 |
| `copilotkit-demo-phase2` (`phase-2`) | `ng serve --port 4300` from `app/` | `app` 4300 |
| `main`, separately | `pnpm present` in `slides/` | Slidev 3030 |

The phase-2 tab talks to the 8888 agent that main's `pnpm dev` already started. Same file, same branch
content, so there is nothing to gain by starting a second one.

Starting the agent from the phase-2 worktree instead does not work: main's `pnpm dev` starts `agent/`
unconditionally, so whichever worktree comes second fails to bind 8888, loudly, inside a parallel
output stream.

### Screens, windows, tabs

**One projected browser window, three tabs**, left to right in the order the talk uses them:
deck `localhost:3030` | phase 1 `localhost:4200` | phase 2 `localhost:4300`. Every transition all
hour, including beat 7's swap, is a tab change.

The **laptop screen is extended, not mirrored**, and carries what the room never sees: Slidev's
presenter view at `/presenter`, and the two terminals. Terminals are never projected.

The phase-1 tab stays open through beat 7. It costs nothing, it shows the room you did not touch it,
and it is the fallback if the .NET side is dead.

**The two apps are never side by side.** Two identical-looking boards at half width is the one
arrangement in which the audience cannot tell which is which, and phase 2's whole claim is sameness,
which needs sequence to read.

### Night before

1. Capture trace 1 and finish the deck.
2. `slidev export` to `slides/deck.pdf`, commit.
3. Rebase `phase-2` onto `main`.
4. `git diff main phase-2 --stat` shows **exactly one file**. This is a check, not a vibe: the
   six-line diff is on a slide and is only true if nothing drifted.
5. Run beat 7 once against the rebased worktree.

The rebase deliberately does not sit in the door-time list. Rebasing under time pressure is how beat 7
breaks.

### At the door

1. `pnpm dev` in the main worktree. Wait for all four names in the stream.
2. `ng serve --port 4300` in the phase-2 worktree.
3. `pnpm present` in `slides/`.
4. One throwaway prompt into 4200, one into 4300. **The 4300 one is not optional.** The `.env` hole
   (§5) fails only on the .NET side, so this is the only pre-flight step that proves the key reached
   the agent.
5. Hard-reload both app tabs. The Board is in memory, so this is a complete reset to Seed with an
   empty transcript.
6. Deck to slide 1, presenter view on the laptop, display extended, notifications off.

### Recovery

Light resilience means these are decided now and written down, not improvised.

| what breaks | move |
|---|---|
| A prompt returns something wrong or ugly | Say so out loud, retype once. Never twice. Twice is a debugging session in front of an audience. |
| Beat 4 guesses instead of asking which Bruno Task | **Not a failure.** Narrate it. It resolved your words and resolved them wrong, which is the beat's own title. |
| Board in a bad state mid-talk | Reset. Safe at any point, costs only visible history. |
| Runtime or MCP dies | Laptop terminal, `pnpm dev` again. Chat errors are the tell. Beats 1 to 6 only. |
| The .NET agent is dead at beat 7 | **No live recovery, and none needed.** The read-through comes before the run precisely so the slides carry the argument. Say what would happen and go to the close. |
| Slidev dies | `slides/deck.pdf`. |
| OpenAI or the venue network is down | Nothing. `deck.pdf` and talk it through. |

**A pre-recorded clip of beat 7 is refused on purpose, not overlooked.** It is the cheapest insurance
in the plan and the only place where light resilience costs the climax of the talk. A video of your
demo, shown as your demo, is a substitution the room feels.

### Rehearsal

Two activities, weeks apart.

**Prompt drilling, during the build.** Each of the twelve pinned prompts, run about 5 times from its
correct Board state. Anything under 5/5 gets its **wording** changed, never its beat dropped, since
nothing is designated as the cut. This is how beat 4 finally gets tested.

**Full run-throughs, at least two**, out loud and timed, one of them on the real projector in the real
room. Two things stay unverified until then: whether `agent.cs` at ~31 lines fits one screen at
presentation font, and whether traces 1 and 2 are legible from the back row.

**Timing without a stopwatch on stage.** Slidev's presenter view shows elapsed time. Four checkpoints:
end of beat 1 (~4), end of opener (~17), end of beat 6 (~40), start of beat 7 (~43).

---

## 13. Known behaviours and constraints

Things that were verified empirically and will otherwise surprise whoever builds this.

### The Board is stale for a whole turn

Confirmed by a spike on
[`prototype/two-call-turn`](https://github.com/FabienDehopre-Satellit/copilotkit-demo/tree/prototype/two-call-turn),
using the real app, the real runtime, a real stdio MCP server, and a scripted fake OpenAI Responses
API so the beat-6 sequence is deterministic
([#14](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/14)).

Within a single turn, every model call gets the same Board, including calls made after a mutation. The
app knew the new Board 7ms before the next model call and the model still got the old one. This is not
a race and waiting does not help: `input.context` becomes one system message built once per run, and
`streamText` loops over that same array. Nothing re-reads context between steps.

No pinned prompt reaches this, which is why the mitigation is the prompt-design rule in §10 rather
than code.

Three related corrections to how this was first understood:

1. **A frontend tool does not end the run.** `assignTask` executed in the browser and its result fed
   back into the *same* run in 16ms. Beat 6 is one run, three steps.
2. **`connectAgentContext` is reactive, not run-start-captured.** The accessor runs at registration
   and again about 1ms after the signal changes, never at run start. The accessor keeps CopilotKit's
   held value fresh; it is the *run input* that freezes. The advice is unchanged, the reason is
   different.
3. **The staleness window is a whole turn, not a gap between steps.** There is no between-steps read
   at all.

### The UI leads the transcript

The column flipped at `01.033`; the agent's summary streamed after `01.041`. On stage the card moves
first and the sentence follows. That is the good direction, and there is nothing to rehearse around.

### An unavoidable warning in the runtime terminal

The AI SDK prints, on every turn: *"System messages in the prompt or messages fields can be a security
risk…"*. Folding context into a system message is exactly what `BuiltInAgent` does, so this cannot be
silenced. Terminals are never projected, so it stays on the laptop.

### Ordering inside a real Responses-API payload

Both `function_call` entries are grouped ahead of both `function_call_output` entries rather than
interleaved. Harmless, but worth knowing if trace 2 is drawn from a real payload as a starting point.

### Nullable parameters do not reach the model

`z.string().nullable()` on a tool parameter kills the turn. The client serialises it to
`{ "type": ["string", "null"] }`, and the runtime converts every incoming tool schema back into Zod
through a converter that handles `object`, `string`, `number`, `integer`, `boolean` and `array` and
nothing else. Anything else logs `Invalid JSON schema` and throws before the model is called, so the
chat sits there and returns an empty reply. A bare `{ "type": "null" }` inside an `anyOf` fails the
same way.

So an absence is an *omitted* optional string, never a null one. `assignTask`'s handler still accepts
a literal `null` for a model that sends one anyway; it is the schema that cannot say the word.

**The converter this is about is the runtime's own**, `convertJsonSchemaToZodSchema` in
`@copilotkit/runtime`'s `agent/index`. `@copilotkit/shared` ships a same-named function that *does*
handle `"null"`, falling back to `z.any()` with a warning — so reading the wrong one suggests this
works. Re-check the runtime's copy on any version bump; the failure is a dead turn, not an error in
the browser.

### `respond()` hands back an envelope, not the value

`registerHumanInTheLoop` replaces the tool's handler with one that parks on a promise, and that
promise resolves with `{ toolCallId, toolName, result }` rather than with what the component passed
to `respond()`. Anything that is not already a string is then `JSON.stringify`d, so the tool message
the model reads — and the panel that renders it — carry that JSON object.

The model copes. The room should not have to, so the confirm component unwraps the envelope before
displaying it. There is no way to intercept it earlier: the wrapping happens inside the library.

### Token cost

Context is re-sent in full on every turn, not once. Eight Tasks of five short fields is about 300
tokens. Keep the exposed Board projection in the low single-digit kB. Descriptions are fine at one
line; timestamps and comment threads would not be.

---

## 14. Out of scope

Ruled out on the map. None of these return without redrawing the destination.

- **Wiring the phase-2 MAF agent to MCP.** MCP is runtime-only, so the beat is phase 1's. MAF's own
  MCP support gets one sentence on slide 14. Building it is a second phase-2 build, not a talk beat.
- **MAF behind the Node CopilotRuntime.** This is the production answer to the browser-direct AG-UI
  caveat, so it earns one sentence on slide 14, as the third state of the architecture diagram.
  Building it would add a third topology to a talk whose argument is the fork between two. Retired by
  being explained rather than built.
- Auth and multi-user.
- Real persistence. In-memory is the ceiling; a JSON file would already be more than the demo needs.
- Deployment and hosting.
- Custom styling beyond Angular defaults plus CopilotKit's stylesheet.
- Multi-agent orchestration, CoAgents, LangGraph.
- Automated tests. `--skip-tests` at scaffold time, and empty `.spec.ts` files are noise in a repo
  people will clone.

---

## 15. Decision index

Every ticket that fed this document.

| ticket | what it settled |
|---|---|
| [#2](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/2) | Angular CopilotKit APIs, version 0.3.1, parity gaps, MCP is runtime-only |
| [#3](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/3) | Context vs shared state, the accessor rule, token cost |
| [#4](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/4) | Node runtime v2 API, `mcpClients` vs `mcpServers`, `maxSteps` default of 1, wildcard renderer |
| [#5](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/5) | The MAF AG-UI adapter exists and is first-party; frontend tools survive; the browser-direct caveat |
| [#6](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/6) | Domain model, the four mutating tools, the Seed, Reset |
| [#7](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/7) | The seven beats, every literal prompt, the pinned Seed table, `showBoard` |
| [#8](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/8) | The MCP server, the roster, snake_case tools, Ines |
| [#9](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/9) | `agent.cs`, the one-file branch diff, the two-worktree switch |
| [#10](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/10) | Workspace layout, scripts, ports, `.env`, Angular scaffolding, branches, README |
| [#12](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/12) | `selfManagedAgents` is unenforced; the threads drawer is not |
| [#13](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/13) | The nineteen slides, `slides/`, the two traces, no projected editor |
| [#14](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/14) | Board staleness within a turn, the prompt-design rule, `maxSteps >= 3` is exact |
| [#15](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/15) | `MapAGUIServer` drops `context`, and the 11-line fix |
| [#17](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/17) | Five processes, three tabs, the Runsheet, recovery, rehearsal |
| [#27](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/27) | Reset sets the thread id as a binding, not an agent write, and pays the welcome screen for it |
| [#29](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/29) | The continuation fix, `agent.cs` at ~105 lines rather than 31, `@ag-ui/client` declared on `main` |

Research write-ups live on their own branches under `docs/research/`:
`angular-surface-area`, `agent-state-in-angular`, `runtime-and-mcp`, `maf-over-agui`,
`maf-agui-context`. The two-call spike is on `prototype/two-call-turn`.
