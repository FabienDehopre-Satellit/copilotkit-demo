# Does `MapAGUIServer` forward `RunAgentInput.context` to the model?

Research for [#15](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/15). Answers the risk
that [#9](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/9) ticketed rather than assumed.

**Short answer: no. Nothing in the MAF AG-UI hosting path reads `RunAgentInput.context`.** The field is
deserialized and then dropped on the floor as far as the model is concerned. `chatClient.AsAIAgent(name,
instructions)` behind `MapAGUIServer("/", agent)` will never see the Board. Fixing it costs about ten lines of
C# in `agent.cs` and no new package reference — and those ten lines are the same shape Microsoft's own
`Step05_StateManagement` sample uses to read `state`, so the pattern is first-party, not a workaround.

Both halves — the "no" and the fix — were verified by running the real published preview package against a
real HTTP POST, not only by reading source.

---

## 1. Where the code actually lives (and the thing that changed under us)

`Microsoft.Agents.AI.AGUI` no longer contains the protocol. It has been reduced to a migration note:

> The in-tree `Microsoft.Agents.AI.AGUI` package has been **removed**. Its AG-UI protocol abstractions now
> live in the official **AG-UI C# SDK** (`AGUI.*` packages) published on NuGet.org by the AG-UI team.
> — [`dotnet/src/Microsoft.Agents.AI.AGUI/README.md`](https://github.com/microsoft/agent-framework/blob/main/dotnet/src/Microsoft.Agents.AI.AGUI/README.md)

The same note records the rename that [#5](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/5)
already picked up: `AddAGUI()`/`MapAGUI()` → `AddAGUIServer()`/`MapAGUIServer()`.

So there are two repositories in the trace, not one:

| Layer | Package | Repo |
| --- | --- | --- |
| ASP.NET glue, session store, `MapAGUIServer` | `Microsoft.Agents.AI.Hosting.AGUI.AspNetCore` | [microsoft/agent-framework](https://github.com/microsoft/agent-framework) |
| `RunAgentInput` type, wire→MEAI mapping, SSE event stream | `AGUI.Abstractions` + `AGUI.Server` | [ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui), `sdks/dotnet` |

This is not a "main has moved on" hazard. The **published** preview package the demo would pin already
depends on the split packages — from the nuspec of
`Microsoft.Agents.AI.Hosting.AGUI.AspNetCore 1.19.0-preview.260822.1` (the newest version on NuGet, and the
one [#5](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/5) found):

```xml
<dependency id="AGUI.Abstractions" version="0.0.5" />
<dependency id="AGUI.Server" version="0.0.5" />
```

Source read at `microsoft/agent-framework@6d532cf` and `ag-ui-protocol/ag-ui@a0d5a7f`.

## 2. The field exists on the wire and is bound correctly

`RunAgentInput.Context` is a real, deserialized property — the answer is not "the JSON never arrives":

```csharp
/// <summary>Gets or sets contextual information for the agent.</summary>
[JsonPropertyName("context")]
[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
public IList<AGUIContext>? Context { get; set; }
```
— [`sdks/dotnet/src/AGUI.Abstractions/Context/RunAgentInput.cs:60-65`](https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/dotnet/src/AGUI.Abstractions/Context/RunAgentInput.cs)

`AGUIContext` is exactly the `{description, value}` pair `connectAgentContext()` sends, both plain strings
([`AGUIContext.cs:9-21`](https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/dotnet/src/AGUI.Abstractions/Context/AGUIContext.cs)).
The C# file even carries `// Keep in sync with sdks/typescript/packages/core/src/types.ts`, which is the same
type [#3](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/3) traced from the Angular side.

## 3. The mapping never reads it

`MapAGUIServer` binds the body and hands it to exactly one adapter call:

```csharp
var ctx = input.ToChatRequestContext(jsonSerializerOptions, streamOptions);
...
var events = hostAgent
    .RunStreamingAsync(
        ctx.Messages,
        session: session,
        options: new ChatClientAgentRunOptions { ChatOptions = ctx.ChatOptions },
        cancellationToken: cancellationToken)
```
— [`AGUIEndpointRouteBuilderExtensions.cs:140-157`](https://github.com/microsoft/agent-framework/blob/main/dotnet/src/Microsoft.Agents.AI.Hosting.AGUI.AspNetCore/AGUIEndpointRouteBuilderExtensions.cs)

Only `ctx.Messages` and `ctx.ChatOptions` reach the agent. So everything turns on
`ToChatRequestContext`. That method reads three fields of the input and no others:

- `input.Messages` → `messages` ([`RunAgentInputExtensions.cs:50`](https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/dotnet/src/AGUI.Server/RunAgentInputExtensions.cs))
- `input.Tools` → client tools, wrapped for the approval flow (`:51`, `:191-226`)
- `input.Resume` → interrupt/approval continuation content appended to `messages` (`:68-92`)

`input.Context` is not one of them. Nor is `input.State` or `input.ForwardedProperties`. What happens to the
rest of the input is that the whole object is stashed for the application to find later:

```csharp
var chatOptions = new ChatOptions
{
    AdditionalProperties = new AdditionalPropertiesDictionary
    {
        [AGUIConstants.RunAgentInputKey] = input,
    },
};
```
— [`RunAgentInputExtensions.cs:94-100`](https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/dotnet/src/AGUI.Server/RunAgentInputExtensions.cs)

recoverable via `ChatOptions.TryGetRunAgentInput(...)` (`:127-140`), whose own doc comment states the design
intent plainly:

> Delegating `IChatClient` implementations and agents use this to read AG-UI inputs such as
> `RunAgentInput.State` without depending on the hosting layer's internals.

That is the framework saying, in an XML doc, that reading these fields is the app's job.

**Grep, whole .NET SDK `src/`, for every reference to the property:**

```
src/AGUI.A2UI/A2UIChatClient.cs:411:            input.Context is null)
src/AGUI.A2UI/A2UIChatClient.cs:418:        foreach (AGUIContext entry in input.Context)
src/AGUI.Client/AGUIChatClient.cs:359:                if (providedInput.Context is { Count: > 0 })
src/AGUI.Client/AGUIChatClient.cs:361:                    input.Context = providedInput.Context;
```

Four hits, none of them on the server path we use. `AGUI.Client` is the outbound direction (a .NET *client*
copying context onto an outgoing request). `AGUI.A2UI` is a separate opt-in Agent-to-UI package that is not
referenced by the MAF hosting package. The same grep across
`dotnet/src/Microsoft.Agents.AI.Hosting.AGUI.AspNetCore` and `dotnet/samples/02-agents/AGUI` in the MAF repo
returns **zero** hits.

## 4. Verified by running it, not just reading it

Reading a mapping function is good evidence but not proof that nothing downstream re-injects the field. So I
built a file-based app against the actual published package with a fake `IChatClient` that echoes back
everything it was handed, and POSTed a real `RunAgentInput`.

`probe.cs` (abridged — the full probe is reproduced in §7):

```csharp
#:sdk Microsoft.NET.Sdk.Web
#:package Microsoft.Agents.AI.Hosting.AGUI.AspNetCore@1.19.0-preview.260822.1

builder.Services.AddAGUIServer();
AIAgent agent = new DumpingChatClient().AsAIAgent(name: "Probe", instructions: "SYSTEM-PROMPT-MARKER");
app.MapAGUIServer("/", agent);
```

Request body — deliberately shaped like the demo's beat 7:

```json
{
  "threadId": "t1", "runId": "r1",
  "messages": [{ "id": "m1", "role": "user", "content": "Amira finished the profile page - mark it done" }],
  "context": [{ "description": "The current task board",
                "value": "CONTEXT-BOARD-MARKER: T-4 Build the profile page (in progress, Amira)" }],
  "state": { "boardStateMarker": "STATE-MARKER" }
}
```

What the chat client — i.e. what the model — actually received:

```
INSTRUCTIONS=[SYSTEM-PROMPT-MARKER]
ADDPROPKEYS=[agui_input]
MESSAGES={user: Amira finished the profile page - mark it done}
```

`CONTEXT-BOARD-MARKER` is absent. `STATE-MARKER` is absent. The system prompt is the `instructions` string
and nothing more. The only trace of the rest of the input is the `agui_input` key in
`ChatOptions.AdditionalProperties` — the stash from §3, confirming the mechanism as well as the negative
result.

**This settles sub-question 1: `chatClient.AsAIAgent(name, instructions)` does not pick up `context`, and no
amount of configuration makes it. `agent.cs` as specced in #9 would have made beat 7 fail on stage.**

## 5. The fix, and its price

Sub-question 2 is moot; sub-question 3 asked to price two fallbacks. Only one of them should be on the table.

### Option (b): fold context into the prompt in `agent.cs` — recommended

Microsoft's own answer for the sibling field is on Learn, under *State Management with AG-UI*:

> `MapAGUIServer` stores the originating `RunAgentInput` on `ChatOptions`. If the model needs the client's
> current state, wrap the base agent with a lightweight `DelegatingAIAgent` that recovers the state with
> `TryGetRunAgentInput` and adds it to the model context.
> — [learn.microsoft.com/agent-framework/…/ag-ui/state-management](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/state-management#read-client-state)

and the runnable version is
[`Step05_StateManagement/Server/RecipeStateAgent.cs`](https://github.com/microsoft/agent-framework/blob/main/dotnet/samples/02-agents/AGUI/Step05_StateManagement/Server/RecipeStateAgent.cs),
26 lines of `DelegatingAIAgent` that prepend a system message. Context is *easier* than state, because
`AGUIContext.Value` is already a string — no `JsonElement` handling.

A named `DelegatingAIAgent` subclass is one option, but a file-based `app.cs` does not need a class at all:
`AIAgentBuilder` has an anonymous middleware overload
([`AIAgentBuilder.cs:112`](https://github.com/microsoft/agent-framework/blob/main/dotnet/src/Microsoft.Agents.AI/AIAgentBuilder.cs))
whose contract is "the delegate should be passed whatever messages, session, options, and cancellation token
should be passed along to the next stage in the pipeline". That reduces the whole thing to an inline lambda:

```csharp
AIAgent agent = chatClient
    .AsAIAgent(name: "BoardAgent", instructions: SystemPrompt)
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

app.MapAGUIServer("/", agent);
```

**Verified working.** Same probe harness, same request body, this agent instead:

```
INSTRUCTIONS=[SYSTEM-PROMPT-MARKER]
MESSAGES={system: The current task board: | CONTEXT-BOARD-MARKER: T-4 Build the profile page (in progress, Amira)}
        {user: Amira finished the profile page - mark it done}
```

The Board arrives, ahead of the user turn, as a system message. Beat 7's "mark it done" now has the `T-4`
resolution it needs.

Costs, honestly:

- **Two `using` lines** — `AGUI.Abstractions` (for `RunAgentInput`) and `AGUI.Server` (for
  `TryGetRunAgentInput`). **No new `#:package` line**: both come transitively from the hosting package, and
  the probe compiled without any extra reference. Confirmed by build, not assumed.
- **~11 lines** in a file that #9 budgeted at ~20. `agent.cs` becomes ~31 lines. Still one screen, still
  readable at the back of the room.
- **The "identical" claim in beat 7 gets weaker in one specific way, and the weakening is arguable in the
  demo's favour.** Beat 7 claims the same prompts produce the same behaviour, and they still do. What is no
  longer true is that the C# is *only* wiring. But phase 1 was never doing nothing here either — per
  [#3](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/3) the Node `BuiltInAgent` folds
  context into the system prompt on every turn; it just does it invisibly, inside a dependency. The lambda is
  that same step, made visible. "Here is the one thing the Node tier was doing for you, and here it is in
  eleven lines of C#" is a stronger read-through than "look, no code", and it lands on an audience that is
  mostly .NET.

Two notes for the build:

- The middleware runs per POST, so the Board is re-supplied every turn, including the continuation turn after a
  frontend tool result. That matches phase 1 and matches
  [#3](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/3)'s token-cost note: the Board is on
  the wire and in the prompt on every turn.
- #9 registers no `AgentSessionStore`, so sessions are ephemeral
  ([`AGUIEndpointRouteBuilderExtensions.cs:78-83`](https://github.com/microsoft/agent-framework/blob/main/dotnet/src/Microsoft.Agents.AI.Hosting.AGUI.AspNetCore/AGUIEndpointRouteBuilderExtensions.cs))
  and the injected system message cannot accumulate across turns in persisted history. *Inferred, not tested:*
  if a session store is ever added, check whether the injected message gets persisted and repeated.

### Option (a): send the Board as a chat message from Angular — do not do this

Priced for completeness. It is the more expensive option on every axis:

- It changes **phase 1**, which currently works. A fix for a phase-2 problem should not touch the branch that
  is not broken.
- It unpicks part of [#6](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/6), whose decision
  was "the agent sees **one** `connectAgentContext()` entry holding the stringified board (accessor, not
  object)". Replacing that with a synthesized message means hand-managing when to inject, how often, and how to
  avoid the Board appearing eight times in a ten-turn conversation — the exact bookkeeping
  `connectAgentContext()` exists to remove.
- It costs a *slide*. `connectAgentContext()` is on screen in beat 2 as the answer to "how does the agent read
  the app?". A hand-rolled message pump is a worse answer and a worse demo.
- The Angular-side line count is not obviously smaller than eleven lines of C# anyway.

The only argument for (a) was preserving a zero-code `agent.cs`, and §5 argues that was never the stronger
narrative.

## 6. Why the docs are silent, and what that means for the pin

The Learn silence [#15](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/15) flagged is real
and is now explained rather than merely observed. The .NET integration's own feature list enumerates
"[client state, state snapshots and deltas, and forwarded properties](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/)"
— `context` is absent because the hosting layer genuinely does not implement it. The
[security-considerations page](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/security-considerations)
*does* discuss context ("Context Injection", "Context: generated by the trusted frontend; if it contains any
untrusted input, it must be validated"), but that page describes the AG-UI protocol's threat model in general,
not what the .NET adapter reads. The absence in the feature docs was the accurate signal.

One consequence worth carrying to the spec: because `context` is not a documented, tested feature of the .NET
adapter, there is nothing preventing a future preview from starting to fold it in automatically, at which
point the lambda would double the Board in the prompt. Pin the package version exactly — which
[#9](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/9) already requires for a different
reason — and the risk is zero for the talk.

## 7. Reproducing the probe

`dotnet --version` 10.0.400, macOS, no API key needed — the fake chat client never calls a model.

```csharp
#:sdk Microsoft.NET.Sdk.Web
#:package Microsoft.Agents.AI.Hosting.AGUI.AspNetCore@1.19.0-preview.260822.1

using System.Runtime.CompilerServices;
using System.Text;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using Microsoft.Extensions.AI;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAGUIServer();
builder.WebHost.UseUrls("http://localhost:8899");
var app = builder.Build();

AIAgent agent = new DumpingChatClient().AsAIAgent(name: "Probe", instructions: "SYSTEM-PROMPT-MARKER");
app.MapAGUIServer("/", agent);
await app.RunAsync();

internal sealed class DumpingChatClient : IChatClient
{
    private static string Dump(IEnumerable<ChatMessage> messages, ChatOptions? options)
    {
        var sb = new StringBuilder();
        sb.Append("INSTRUCTIONS=[").Append(options?.Instructions ?? "<null>").Append("] ");
        sb.Append("ADDPROPKEYS=[")
          .Append(options?.AdditionalProperties is null ? "<null>" : string.Join(",", options.AdditionalProperties.Keys))
          .Append("] ");
        sb.Append("MESSAGES=");
        foreach (var m in messages) { sb.Append('{').Append(m.Role).Append(": ").Append(m.Text).Append("} "); }
        return sb.ToString();
    }

    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken ct = default)
        => Task.FromResult(new ChatResponse(new ChatMessage(ChatRole.Assistant, Dump(messages, options))));

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, [EnumeratorCancellation] CancellationToken ct = default)
    {
        yield return new ChatResponseUpdate(ChatRole.Assistant, Dump(messages, options));
        await Task.CompletedTask;
    }

    public object? GetService(Type serviceType, object? serviceKey = null) => null;
    public void Dispose() { }
}
```

```
dotnet run probe.cs
curl -s -X POST http://localhost:8899/ \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  --data-binary @input.json
```

Swap in the `.AsBuilder().Use(...)` block from §5 to see the positive case.

## Sources

All primary. No blog posts.

- [microsoft/agent-framework](https://github.com/microsoft/agent-framework) @ `6d532cf` — hosting adapter,
  `AIAgentBuilder`, `Step05_StateManagement` sample, `Microsoft.Agents.AI.AGUI` migration note.
- [ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui) @ `a0d5a7f`, `sdks/dotnet` —
  `RunAgentInput`, `AGUIContext`, `RunAgentInputExtensions.ToChatRequestContext`.
- NuGet v3 flat-container API — version list and nuspec for
  `Microsoft.Agents.AI.Hosting.AGUI.AspNetCore 1.19.0-preview.260822.1`.
- Microsoft Learn — [AG-UI integration](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/),
  [state management](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/state-management),
  [security considerations](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/security-considerations).
- Live probe against the published preview package, .NET SDK 10.0.400.
