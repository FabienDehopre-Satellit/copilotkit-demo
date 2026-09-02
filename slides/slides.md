---
theme: default
title: An agent in your Angular app
info: |
  CopilotKit for Angular, and then the same demo again in C#.
  Internal Satellit talk. https://github.com/FabienDehopre-Satellit/copilotkit-demo
layout: cover
---

# An agent in your Angular app

CopilotKit, and then the same demo again in C#

<div class="mt-12 opacity-70">

Satellit &middot; internal talk

</div>

<!--
Beat 1 is typed while this slide is up. The 4200 tab, cold:

  "What usually goes wrong when a company builds its own employee onboarding portal?"

Off-board on purpose. Plain answer, no tool call. Say nothing about how it works yet — that is
the next thirteen minutes. ~4 minutes on the clock at the end of this.
-->

---

# That was two lines of Angular

```ts
// app/src/app/app.config.ts
providers: [
  provideCopilotKit({ runtimeUrl: 'http://localhost:8200/api/copilotkit' }),
]
```

```html
<!-- app/src/app/app.html -->
<copilot-chat />
```

<v-click>

A provider and a component. There is no third thing yet: no state, no tools, nothing that has
heard of the Board you can see next to the chat.

</v-click>

<!--
The url is absolute and cross-origin on purpose — no dev-server proxy. That is a phase-2
decision and it comes back on slide 15; do not spend time on it here.

Do not say "and a Node server on 8200" yet. The Node tier's narrative job is to appear on the
architecture slide and disappear in the same breath.
-->

---

# Where this is going

<div class="mt-8">

```text
  Phase 1    Angular  ──▶  Node runtime  ──▶  OpenAI
  Phase 2    Angular  ──▶  C# agent      ──▶  OpenAI
```

</div>

<v-click>

Same app. Same Board. Same five tools. **One line of Angular changes between them.**

</v-click>

<v-click>

Phase 2 is where most of you live, so it gets a real read-through, not an epilogue.

</v-click>

<!--
This is the agenda, deliberately placed after something has happened rather than before it.
Thirty seconds. The fork is the argument of the whole talk; it gets its diagram on slide 14.
-->

---

# Trace 1 — what actually went over the wire

<div style="--slidev-code-font-size: 0.76rem">

```json
{
  "model": "gpt-5-mini",
  "input": [
    { "role": "developer",
      "content": "You are a helpful assistant.\nKeep replies short and plain: they are read off a projector." },
    { "role": "user",
      "content": [{ "type": "input_text",
                    "text": "What usually goes wrong when a company builds its own employee onboarding portal?" }] }
  ]
}
```

```text
Common failures and how to avoid them
- Scope creep: project balloons with extra features …
- Integration gaps: payroll, HRIS, SSO, benefits, devices don't connect …
```

</div>

<div class="text-xs opacity-70 mt-2">

Captured from the runtime with the frontend of the previous slide behind it. The `tools` array is
cut from the paste: the only two in it belong to the Team directory, which the runtime attaches to
every turn, and slide 13 comes back to them.

</div>

<v-click>

**Nothing here knows about your app.** No Board. No ids. No verbs. A bland instruction, your
question, and an answer any chatbot would give.

</v-click>

<!--
Real capture, from the runtime, of the prompt you just typed. `input`, `developer`, `input_text`
are Responses-API vocabulary, not the older `messages` / `tool_calls` shape — say so once, so
that trace 2 reads as the same system.

The reply is cut down to two bullets to fit; it ran to about fifteen. The footnote says what else
was cut, so read it out rather than hoping nobody asks: the request carried the two Team directory
tools the runtime attaches to every turn, and nothing else. What it did not carry is the Board —
which is the gap the next slide is built on.
-->

---

# So what is an agent?

<v-clicks>

- **A model.** Trace 1 has one, and that is all it has.
- **Your app's context.** What the model is allowed to know. Trace 1 has none.
- **Tools.** What the model is allowed to ask for. Nothing in trace 1 can touch the Board.
- **A loop.** Call the model, run what it asked for, feed the result back, call it again.

</v-clicks>

<v-click>

<div class="mt-8">

Everything between here and the C# is those four things. The rest is plumbing.

</div>

</v-click>

<!--
Define against the gaps the room just read, not from a dictionary. "Agent" is the word this
audience has heard most and defined least.

Resist the multi-agent tangent. This talk has one agent all hour.
-->

---

# Trace 2 — the same turn, with a Board and a verb

<div style="--slidev-code-font-size: 0.72rem">

<v-click>

```json
{ "role": "developer",
  "content": "You are a helpful assistant. …\n
              ## Context from the application\n
              The current task board:\n
              [{\"id\":\"T-4\",\"title\":\"Build the profile page\",\"status\":\"doing\",\"assignee\":\"Amira\"}, …]" }
```

</v-click>

<v-click>

```json
{ "role": "user", "content": [{ "type": "input_text", "text": "Amira finished the profile page — mark it done." }] }

{ "type": "function_call", "call_id": "call_wYvh…", "name": "moveTask",
  "arguments": "{\"id\":\"T-4\",\"status\":\"done\"}" }
```

</v-click>

<v-click>

```json
{ "type": "function_call_output", "call_id": "call_wYvh…",
  "output": "Moved T-4 “Build the profile page” to done." }
```

</v-click>

<v-click>

```text
Done — I moved "Build the profile page" to done.
```

</v-click>

</div>

<!--
Four parts, in this order:

1. the Board, serialised into the instructions — nobody typed "T-4"
2. the request. The model asked for `moveTask`. It did not run anything
3. the result, handed back in, and the run continues
4. the sentence the user reads

Hand-built, so it is four parts and nothing else. Say that out loud — a real capture of this turn
carries ids, token counts and two tools nobody is talking about yet.

You watch it produce this in about two minutes.
-->

---

# Tool-calling

<v-clicks>

- A tool is **a name, a description, and a JSON schema**. That is the whole declaration.
- The model **requests** a call. **Your code runs it.** The loop **feeds the result back**.
- The description is not documentation. It is the only thing steering the choice.
- The loop needs a step budget: `maxSteps: 5`.

</v-clicks>

<v-click>

<div class="mt-6">

The runtime default is **1** — enough for the model to ask and never hear the answer. Beat 6
chains two calls in one turn and needs at least 3.

</div>

</v-click>

<!--
"Your code runs it" is the sentence this room needs. Nothing executes inside the model.

The naming difference between `moveTask` and `find_teammates` comes back at beat 6, and it is
the free visual cue that they came from two different places.
-->

---

# CopilotKit

<v-clicks>

- **A chat UI.** `<copilot-chat>`, and a popup and a sidebar you are not seeing today.
- **A runtime.** The Node tier on 8200. It holds the model key and the loop.
- **A protocol.** AG-UI, between the browser and whatever is answering. Defined on slide 14,
  because that is where it starts to matter.

</v-clicks>

<v-click>

<div class="mt-8">

`@copilotkit/angular` **0.3.1** — a first-party, signal-based port of the React package. MIT.
Two months old, twenty-five versions, so the version is pinned exactly and so is everything else
in this repo.

</div>

</v-click>

<!--
Do not oversell the maturity and do not apologise for it either. The pinning is the answer to
"is this safe to try", and this room pins things for a living.
-->

---

# The agent reads the Board

```ts
connectAgentContext(() => ({
  description: 'The current task board',
  value: JSON.stringify(this.board.tasks()),
}));
```

<v-clicks>

- **An accessor, not an object.** It wraps an `effect()`, so a plain object registers once and
  never follows the signal again.
- One entry, re-serialised on every turn. That is the entire read channel.
- There is also `injectAgentStore()`, shared state both ways. Not used here: the Board stays owned
  by Angular signals, one writer, nothing to desync on stage.

</v-clicks>

<!--
Beat 2, on 4200:

  "What's Bruno working on, and is anything not assigned to anyone yet?"

Two Tasks share Bruno and exactly one todo is unassigned, so a right answer proves it read all
eight rows and two different fields.

Type it before this slide's clicks if the room looks restless — the code is the answer to
"how did it know", and the question lands better than the answer.
-->

---

# The agent changes the Board

<div class="text-sm">

```ts
registerFrontendTool({
  name: 'moveTask',
  description: `Move a Task to a different status. ${BY_ID}`,
  parameters: z.object({ id: ID, status: z.enum(STATUSES) }),
  handler: async ({ id, status }) => board.moveTask(id, status),
  component: ToolOutcome,
});
```

<v-click>

```ts
registerHumanInTheLoop({
  name: 'deleteTask',
  description: `Remove a Task from the board for good. … the app puts the confirm dialog in
    front of them and tells you whether they went through with it, so never ask for
    confirmation yourself. ${BY_ID}`,
  parameters: z.object({ id: ID }),
  component: DeleteConfirm,   // no handler: the run parks until the user clicks
});
```

</v-click>

</div>

<v-click>

Five tools, all registered in **Angular**. The Node tier's own `tools: []` is empty.

</v-click>

<!--
Beat 3, three prompts on 4200:

  "Amira finished the profile page — mark it done."      moveTask, T-4 to done
  "Put Dries on picking an SSO provider."                assignTask, T-3 to Dries
  "Actually, drop the domain registration task."         deleteTask on T-7, then the dialog

Nobody typed an id. The model resolved every one of them off the context from the last slide.

On the delete: saying "the user is asked to confirm" and stopping there gets the model asking in
prose and never calling the tool. Naming the app as the thing that asks is what puts the dialog
on screen on the first turn.

`tools: []` being empty is the load-bearing detail for beat 7. Plant it here.
-->

---
layout: statement
---

# It resolves your words, and it can resolve them wrong

<!--
Beat 4, on 4200:

  "Put Bruno's task in done."

Bruno holds exactly two, so the request is genuinely ambiguous and the agent should ask which.
Answer "the equipment checklist" and it moves T-5.

If it guesses instead of asking: **narrate it, do not retype.** It resolved your words and
resolved them wrong, which is this slide's own title. That is the most useful thing a room with
no agent experience leaves with, and it is better on purpose here than by accident at beat 6.

No new Angular API on this slide, which is why there is no code on it.
-->

---

# A tool can return UI

<div class="text-sm">

```ts
registerFrontendTool({
  name: 'showBoard',
  description: 'Show the user the whole board. … it renders the three columns in the chat and changes nothing.',
  parameters: z.object({}),
  handler: async () => 'The board is on screen in the chat.',
  component: MiniBoard,
});
```

</div>

<v-clicks>

- `component:` is Angular's spelling of React's `render`. A component, not a function.
- A **mutating tool** changes the Board: create, move, assign, delete.
- A **rendering tool** changes nothing. `showBoard` exists only to put something on screen.

</v-clicks>

<!--
Beat 5, two prompts on 4200:

  "Add a task to book the training room for the induction day"     createTask → T-9, as a card
  "Show me the board"                                              showBoard → the mini board

Both cards come out of the same `component:` field. A tool is not only a way to act, it is also
a way to show — that distinction is the beat.

The card is unconditional. Making it depend on the user asking for "a visual confirmation" fails
silently, and every other beat here fails loudly or not at all.
-->

---
layout: statement
---

# Reaching outside the app: MCP

<!--
Beat 6, on 4200 — one prompt, two tool calls, one turn:

  "Who in the team directory has done data or integration work?
   Put them on the HR spreadsheet import."

The Team directory is a separate process the app has never seen: a stdio MCP server the runtime
spawns at startup, holding six Teammates in a `directory.json`. Nothing about it is in the system
prompt — the tool descriptions are the whole of how the agent finds it.

The answer is **Ines**, who appears nowhere on the Board. That is the point: a name that exists in
exactly one place, behind the MCP server.

Say out loud: Chloé holds T-2 and Chloé is Frontend. So the reassign is a correction, not an
arbitrary move.

Watch the transcript: `find_teammates` in a plain, ugly panel — a tool this app has never heard
of — and `assignTask` in its own. Two different places, and the snake_case gives it away.
-->

---

# Architecture

<div class="mt-6 text-sm">

<v-switch>

<template #0>

```text
  ┌────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
  │  Browser   │───▶│ Node runtime │───▶│ BuiltInAgent │───▶│  OpenAI  │
  │  Angular   │    │   :8200      │    │  + MCP dir   │    │          │
  │  :4200     │    │              │    │              │    │          │
  └────────────┘    └──────────────┘    └──────────────┘    └──────────┘
     5 tools              CORS              the loop
```

</template>

<template #1>

```text
  ┌────────────┐                        ┌──────────────┐    ┌──────────┐
  │  Browser   │───────────────────────▶│  C# agent    │───▶│  OpenAI  │
  │  Angular   │                        │  MAF :8888   │    │          │
  │  :4300     │                        │  AG-UI       │    │          │
  └────────────┘                        └──────────────┘    └──────────┘
     5 tools                                 the loop
```

</template>

<template #2>

```text
  ┌────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
  │  Browser   │───▶│ your server  │───▶│  C# agent    │───▶│  OpenAI  │
  │  Angular   │    │ auth, quotas │    │  MAF :8888   │    │          │
  │            │    │              │    │  AG-UI       │    │          │
  └────────────┘    └──────────────┘    └──────────────┘    └──────────┘
     5 tools           production            the loop
```

</template>

</v-switch>

</div>

<div class="mt-4">

<div>

**AG-UI** is the protocol in every one of those arrows: a stream of typed events — `RUN_STARTED`,
`TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`. The five tools ride it as a plain `tools` field, which
is why they survive the middle box changing.

</div>

<v-click at="1">

MCP does not disappear with the Node tier. **It moves** — MAF has first-class MCP support in .NET.

</v-click>

<v-click at="2">

Microsoft's guidance is explicit: **do not expose an AG-UI server straight to a browser.** A
client that can POST arbitrary input can inject system messages and forge tool results. For a
demo on a laptop this is the right shape. For production, the box comes back.

</v-click>

</div>

<!--
Two to three minutes, and the one slide where you slow down. Do not redraw — click.

Build 1: what the room has been watching for forty minutes.
Build 2: the Node tier is gone. Nothing else moved. That is the whole point of the fixed boxes.
Build 3: something comes back, and it is yours, not CopilotKit's.

No model key ever reaches the browser — `HttpAgent` carries a URL, not a credential. Anything you
put in its headers is user-visible, so it has to be a per-user token.
-->

---

# The diff

<div style="--slidev-code-font-size: 0.68rem">

```diff
+import { HttpAgent } from '@ag-ui/client';
 import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
 import { provideCopilotKit } from '@copilotkit/angular';

 export const appConfig: ApplicationConfig = {
   providers: [
     provideBrowserGlobalErrorListeners(),
-    // Absolute, and cross-origin on purpose. No dev-server proxy: phase 2 swaps this one
-    // line for an agent on another origin, so a proxy would be scaffolding to delete.
-    provideCopilotKit({ runtimeUrl: 'http://localhost:8200/api/copilotkit' }),
+    // The whole diff against `main`. The browser now talks straight to the C# agent on 8888,
+    // with no Node tier in the path — which is why `main` never used a dev-server proxy.
+    provideCopilotKit({
+      selfManagedAgents: { default: new HttpAgent({ url: 'http://localhost:8888/' }) },
+    }),
   ],
 };
```

</div>

<v-click>

**One file, six lines added and three taken out.** `git diff main phase-2` is
`app/src/app/app.config.ts` and nothing else.

</v-click>

<v-click>

`runtime/` and `mcp/` are still in the repo on that branch. Nothing is calling them. So are the
slides — this is a repo that contains its own talk.

</v-click>

<!--
Pasted, not run in a terminal. A terminal diff is small, scrolls, and is coloured for a theme you
may not be on.

Nothing is trimmed out of this one, comments included, so the line count on the slide is the line
count the night-before `git diff main phase-2 --stat` check prints.

"Every folder is still there" is the honest answer to the question someone is already forming.
Admitting it costs less than hiding it.
-->

---

# `agent/agent.cs`

<div class="grid grid-cols-2 gap-4" style="--slidev-code-font-size: 0.52rem; --slidev-code-line-height: 0.7rem">

<div>

```csharp
#:sdk Microsoft.NET.Sdk.Web
#:package Microsoft.Agents.AI.Hosting.AGUI.AspNetCore@1.19.0-preview.260822.1
#:package Microsoft.Agents.AI.OpenAI@1.19.0
#:package DotNetEnv@3.2.0

// … eight using lines, every one of them transitive
Env.Load("../.env");        // … and a one-line exit if the file is not there
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://localhost:8888");
builder.Services.AddAGUIServer();
builder.Services.AddCors(o => o.AddDefaultPolicy(
    p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var chatClient = new OpenAIClient(builder.Configuration["OPENAI_API_KEY"])
    .GetChatClient("gpt-5-mini").AsIChatClient();  // … and one for a missing key
AIAgent agent = chatClient
    .AsAIAgent(
        name: "BoardAgent",
        instructions: "You are a helpful assistant.\n"
            + "Keep replies short and plain: they are read off a projector.")
    .AsBuilder()
    .Use(async (messages, session, options, next, ct) =>
    {
        //  ← slide 17: fold `context` back into the messages
        RewrapFrontendTools(options);
        await next(messages, session, options, ct);
    })
    .Build();

var app = builder.Build();
app.UseCors();
app.MapAGUIServer("/", agent);
await app.RunAsync();
```

</div>

<div>

```csharp
static void RewrapFrontendTools(AgentRunOptions? options)
{
    if (options is not ChatClientAgentRunOptions
        { ChatOptions.Tools: { } tools }) return;

    for (var i = 0; i < tools.Count; i++)
    {
        if (tools[i] is AIFunctionDeclaration decl and not AIFunction)
        {
            tools[i] = new ApprovalRequiredAIFunction(
                new FrontendTool(decl));
        }
    }
}

internal sealed class FrontendTool(AIFunctionDeclaration d) : AIFunction
{
    public override string Name => d.Name;
    public override string Description => d.Description;
    public override JsonElement JsonSchema => d.JsonSchema;

    protected override ValueTask<object?> InvokeCoreAsync(
        AIFunctionArguments arguments, CancellationToken ct)
        => throw new NotSupportedException(
            "Frontend tools run in the browser.");
}
```

<div class="text-xs opacity-70 mt-3">

Comments are stripped and the three lines marked `…` are elided. Nothing else is: `agent.cs` runs
to about 120 lines, which is why it is two columns rather than one.

</div>

</div>

</div>

<!--
Read the left column first, top to bottom. Comments are stripped for the projector and the
footnote says so; the file in the repo explains every line of this.

The right column is the second workaround. Once a turn has run a frontend tool, the preview AG-UI
server reads every later turn as a *continuation* and re-declares the untouched tools as bare
declarations. A declaration is not invocable, so beat 7's second prompt would go dead.

Left column, the wiring:
  - `#:package` pins versions inline. No `.csproj`. `dotnet run agent.cs`, no flags
  - `Env.Load` runs before `CreateBuilder`, because ASP.NET snapshots the environment as it adds
    the provider
  - the instructions are copy-pasted verbatim from the Node runtime. Same prompt, other language
  - CORS wide open, because the browser is now the direct client. Slide 14 said what that costs
  - **no backend tools.** The five are still in Angular

Right column: found by playing beat 7, not by reading anything. 0.0.6 fixes it upstream and
cannot be taken — it writes explicit nulls the pinned `@ag-ui/client` rejects, which kills every
turn instead of the second one. Both packages are pinned exactly, in opposite directions.

If someone asks "is this a real project": `dotnet project convert agent.cs`.
-->

---

# The eleven lines the Node tier was doing for you

```csharp
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
```

<v-click>

`MapAGUIServer` reads `messages`, `tools` and `resume`, and **drops `context`**. Without this,
"mark it done" has no `T-4` to resolve.

</v-click>

<v-click>

Phase 1 was never doing nothing here. `BuiltInAgent` folds the same context into the same system
message on every turn, invisibly, inside a dependency.

</v-click>

<!--
This is the payoff of the read-through for a .NET room: not "look, no code", but "here is the one
thing the Node tier was doing for you, and it is eleven lines you can read".

Compare it to slide 9. `connectAgentContext` is what puts the entry in; this is what takes it out.

Then go to 4300 and run both prompts. Verbatim re-runs:

  "Amira finished the profile page — mark it done."
  "Add a task to book the training room for the induction day"

No Reset — the 4300 tab is a different origin and is already on a fresh Seed.

Deliberately anticlimactic. Two prompts rather than one, because one call is an anecdote and two
is a pattern — and the second is the one that renders UI, which is what looks most likely to
break across a backend swap. The payoff is sameness. Let it be boring.
-->

---

# Taking this further

<v-clicks>

- **Backend tools in C#**: `AIFunctionFactory.Create(MyMethod)`, one line. Left out here on
  purpose — a C# tool would make phase 2 behave differently from phase 1, and sameness was the
  whole claim.
- **The key**: `dotnet user-secrets` rather than a root `.env`. The `.env` is a demo convenience
  and nothing else.
- **MCP into MAF**: the directory moves into the C# agent rather than disappearing.

</v-clicks>

<v-click>

<div class="mt-8">

## Licensing

`selfManagedAgents` — the phase-2 prop — is documented as an Enterprise-tier feature. **The gate
is a commercial term, not a code path**: every package is MIT, the check fails open, there is no
licence server and no phone-home. An unlicensed machine hits zero limits. The obligation for
production use is real regardless.

</div>

</v-click>

<!--
"Could we use this here" is the question this room is actually holding. Answer it plainly and do
not editorialise: the technical gate is absent, the commercial obligation is not.

The one thing that genuinely is gated is the threads drawer, which is why this app never mounts
it.
-->

---
layout: two-cols
---

# Resources

<div class="text-sm">

**This repo**<br>
`github.com/FabienDehopre-Satellit/copilotkit-demo`

**CopilotKit for Angular**<br>
`docs.copilotkit.ai/angular`

**Microsoft's AG-UI sample**<br>
`github.com/microsoft/agent-framework`<br>
`dotnet/samples/02-agents/AGUI`

**`dotnet run app.cs`**<br>
`devblogs.microsoft.com/dotnet`<br>
`announcing-dotnet-run-app/`

</div>

::right::

<div class="flex flex-col items-center justify-center h-full">
  <img src="/repo-qr.svg" class="w-60" alt="QR code to this repo on GitHub" />
  <div class="mt-4 opacity-70">Both branches. Phase 1 is <code>main</code>.</div>
</div>

<!--
The QR is what makes "the editor is never projected" cost nothing: it is a real file in a real
app, and they can have it.

Both branches are there. `main` is phase 1, `phase-2` is phase 2, and the README says how to run
them at the same time.

Q&A from here. Nine minutes, and it absorbs any overrun.
-->
