# copilotkit-demo

The demo from the Satellit talk on [CopilotKit](https://copilotkit.ai) for Angular. An Angular app
renders a Board — eight Tasks in three columns — with a chat panel beside it, and an agent that
reads that Board, changes it through tools, and looks people up in a Team directory that lives in a
separate process. Everything is in memory; a reload is a full reset.

The point of the demo is the second half. **Phase 1** puts the agent in a Node CopilotRuntime.
**Phase 2** replaces it with a C# agent speaking AG-UI, and the Angular side changes by one line.
The five Board tools are registered in Angular, not in either tier, which is why the swap is a
config change rather than a port.

| branch | phase | the agent tier |
|---|---|---|
| `main` (default) | Phase 1 | `runtime/`, Node, on 8200 |
| `phase-2` | Phase 2 | `agent/agent.cs`, .NET, on 8888 |

`phase-2` forks from `main` and its entire diff is `app/src/app/app.config.ts` — six lines. Every
workspace member is present on both branches; only that one Angular file differs.

## Prerequisites

- **Node 24** and **pnpm**
- **.NET 10** — for `agent/agent.cs`, which is a file-based app with no `.csproj`
- An **OpenAI API key**

## Setup

```sh
pnpm install
cp .env.example .env      # then put a real OPENAI_API_KEY in it
```

The key goes in `.env` at the repo root, and nowhere else. Nothing reads a root `.env`
automatically, so both tiers load it explicitly — `process.loadEnvFile('../.env')` in the runtime,
`Env.Load("../.env")` in `agent.cs` — and both exit with a one-line message when the file is not
there. Exporting the variable in your shell instead of writing the file starts neither of them.

## Running Phase 1

```sh
pnpm dev
```

Open `http://localhost:4200`.

That starts three processes: `ng serve` on 4200, the runtime on 8200, and the C# agent on 8888.
**Three names in the output stream is correct**, not a broken install. `mcp/` is the fourth Node
member and has no `dev` script, because the runtime spawns it as a stdio child at startup.

The agent on 8888 is running but unused on `main` — Angular is pointed at 8200. It starts anyway so
that Phase 2 needs nothing new started.

## Running Phase 2

To see Phase 2 on its own, with nothing else running:

```sh
git switch phase-2
pnpm dev
```

Open `http://localhost:4200`. Same app, same Board, same tools; the runtime on 8200 is now the
process that is running but unused. Running the two phases side by side is a different line, below —
the second checkout must not run `pnpm dev`.

## Running both at once

Both branches have to be checked out at the same time, which is what a second worktree is for:

```sh
git worktree add ../copilotkit-demo-phase2 phase-2
cd ../copilotkit-demo-phase2 && pnpm install
cd app && pnpm exec ng serve --port 4300
```

Then `localhost:4200` is Phase 1 and `localhost:4300` is Phase 2, and switching between them is a
browser tab.

**The second worktree runs only `ng serve`.** `runtime/`, `mcp/` and `agent/` are byte-identical on
both branches, and `main`'s `pnpm dev` already binds 4200, 8200 and 8888 unconditionally, so a
second `pnpm dev` would start nothing new and fail to bind all three. `app/` is the only package
that genuinely needs two instances. The 4300 tab talks to the 8888 agent the first worktree started;
starting the agent from the second worktree instead does not help, because whichever one comes
second still loses the port.

The second worktree needs no `.env`. `.env` is git-ignored, so a fresh worktree has none, and only
the runtime and the agent ever read it — neither of which this worktree starts.

## What to look at

Five files carry the whole demo.

| file | what it shows |
|---|---|
| [`app/src/app/app.config.ts`](./app/src/app/app.config.ts) | The one file that differs between the phases. `runtimeUrl` on `main`, `selfManagedAgents` with an `HttpAgent` on `phase-2` |
| [`app/src/app/app.ts`](./app/src/app/app.ts) | One `connectAgentContext()` entry is the entire read channel, and a wildcard `registerRenderToolCall({ name: '*' })` is how a tool the app has never heard of still comes back as UI |
| [`app/src/app/tools/board-tools.ts`](./app/src/app/tools/board-tools.ts) | The five Board tools, all frontend tools, each with a `component:` that puts its result in the transcript. `deleteTask` is the one that confirms first |
| [`runtime/src/main.ts`](./runtime/src/main.ts) | The whole Phase 1 tier: one agent, an empty `tools: []`, and the MCP directory attached as `mcpClients` |
| [`agent/agent.cs`](./agent/agent.cs) | The Phase 2 tier, on one screen. It registers no tools either — the Angular ones ride in on `RunAgentInput.tools`. The middleware block in the middle is a workaround, and the comments say what for |

`runtime/` and `mcp/` run under `tsx` straight off source. There is no build step and no `dist/`, so
the file you open is the file that is running.

## The rest of the documents

- [`CONTEXT.md`](./CONTEXT.md) — the glossary. The words in the code, the UI, and the talk are the
  same words, and this is where they are fixed.
- [`docs/demo-spec.md`](./docs/demo-spec.md) — the full spec. Every decision here is argued there,
  and section 15 indexes each one back to the issue that settled it.
- [`docs/runsheet.md`](./docs/runsheet.md) — what to start, check, and do when it breaks on the day.
  Written for whoever is giving the talk, not for whoever cloned it.
- [`slides/slides.md`](./slides/slides.md) — the Deck the room saw, nineteen Slidev slides, with the
  spoken notes under each one. `slides/deck.pdf` is the same thing without a Node process.

There are no automated tests, on purpose. Verification is running the demo.
